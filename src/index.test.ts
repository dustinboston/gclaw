import {describe, it, expect, vi} from 'vitest';

const {
	MockAIMessageChunk,
	mockAgentStream,
	mockRlQuestion,
	mockRlClose,
	mockStdoutWrite,
	mockCheckpointerSetup,
	mockPoolEnd,
	mockInitDatabase,
	mockListSessions,
	mockCreateDeepAgent,
} = vi.hoisted(() => {
	class MockAIMessageChunk {
		text: string;
		tool_calls: unknown[] | undefined;
		constructor({content}: {content: string}) {
			this.text = content;
		}
	}

	return {
		MockAIMessageChunk,
		mockAgentStream: vi.fn().mockImplementation(() =>
			(async function * () {
				const msg = Object.assign(
					Object.create(MockAIMessageChunk.prototype),
					{text: 'response'},
				);
				yield [msg];
			})(),
		),
		mockRlQuestion: vi
			.fn()
			.mockResolvedValueOnce('hello')
			.mockResolvedValueOnce('')
			.mockResolvedValueOnce('exit'),
		mockRlClose: vi.fn(),
		mockStdoutWrite: vi.fn(),
		mockCheckpointerSetup: vi.fn().mockResolvedValue(undefined),
		mockPoolEnd: vi.fn().mockResolvedValue(undefined),
		mockInitDatabase: vi.fn().mockResolvedValue(undefined),
		mockListSessions: vi.fn().mockResolvedValue([]),
		mockCreateDeepAgent: vi.fn().mockReturnValue({stream: vi.fn()}),
	};
});

vi.mock('dotenv/config', () => ({}));
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
	PostgresSaver: class PostgresSaver {
		setup = mockCheckpointerSetup;
	},
}));
vi.mock('deepagents', () => ({
	createDeepAgent: mockCreateDeepAgent.mockReturnValue({stream: mockAgentStream}),
	FilesystemBackend: class FilesystemBackend {
		constructor(_options?: unknown) {}
	},
}));
vi.mock('langchain', () => ({
	HumanMessage: class HumanMessage {
		constructor(public content: string) {}
	},
	AIMessageChunk: MockAIMessageChunk,
	ToolMessage: class ToolMessage {
		constructor(public content: string) {}
	},
}));
vi.mock('./tools/gmail.ts', () => ({
	gmailListEmail: {},
	gmailReadEmail: {},
	gmailArchiveEmail: {},
	gmailDeleteEmail: {},
	gmailSpamEmail: {},
	gmailUnarchiveEmail: {},
	gmailUndeleteEmail: {},
	gmailUnspamEmail: {},
}));
vi.mock('./tools/calendar.ts', () => ({
	calendarListEvents: {},
	calendarCreateEvent: {},
}));
vi.mock('./tools/tasks.ts', () => ({
	tasksListTasks: {},
	tasksCompleteTask: {},
	tasksUpdateTask: {},
	tasksCreateTask: {},
}));
vi.mock('./tools/drive.ts', () => ({
	driveListFiles: {},
	driveReadFile: {},
	driveCreateFolder: {},
	driveMoveFile: {},
	driveRenameFile: {},
	driveUploadTextFile: {},
	driveTrashFile: {},
	driveUntrashFile: {},
}));
vi.mock('./logger.ts', () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));
vi.mock('./providers/database.ts', () => ({
	pool: {query: vi.fn().mockResolvedValue({rows: []}), end: mockPoolEnd},
	initDatabase: mockInitDatabase,
}));
vi.mock('./session.ts', () => ({
	createSession: vi.fn().mockReturnValue('test-session-id'),
	listSessions: mockListSessions,
}));
vi.mock('./config.ts', () => ({
	loadConfig: () => ({googleAiModel: 'test-model'}),
}));
vi.mock('node:readline/promises', () => ({
	createInterface: vi.fn().mockReturnValue({
		question: mockRlQuestion,
		close: mockRlClose,
	}),
}));
vi.mock('node:fs', () => ({
	readFileSync: vi.fn().mockReturnValue(''),
	appendFileSync: vi.fn(),
}));

const originalWrite = process.stdout.write;
process.stdout.write = mockStdoutWrite as any;

await import('./index.ts');

process.stdout.write = originalWrite;

describe('deep agent entry (index.ts)', () => {
	it('initializes database and checkpointer on startup', () => {
		expect(mockInitDatabase).toHaveBeenCalledTimes(1);
		expect(mockCheckpointerSetup).toHaveBeenCalledTimes(1);
	});

	it('creates a deep agent with tools, skills, and a checkpointer', () => {
		expect(mockCreateDeepAgent).toHaveBeenCalledTimes(1);
		const params = mockCreateDeepAgent.mock.calls[0][0];
		expect(params.model).toBe('test-model');
		expect(params.skills).toEqual(['/skills/']);
		expect(params.tools.length).toBeGreaterThan(0);
		expect(params.checkpointer).toBeDefined();
	});

	it('streams response for non-empty input', () => {
		expect(mockAgentStream).toHaveBeenCalledTimes(1);
		expect(mockStdoutWrite).toHaveBeenCalledWith('response');
	});

	it('skips empty input', () => {
		expect(mockAgentStream).toHaveBeenCalledTimes(1);
	});

	it('closes readline and pool on exit', () => {
		expect(mockRlClose).toHaveBeenCalled();
		expect(mockPoolEnd).toHaveBeenCalled();
	});
});
