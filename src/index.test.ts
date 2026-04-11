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
} = vi.hoisted(() => {
	class MockAIMessageChunk {
		text: string;
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
	};
});

vi.mock('dotenv/config', () => ({}));
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
	PostgresSaver: class PostgresSaver {
		constructor() {}
		setup = mockCheckpointerSetup;
	},
}));
vi.mock('langchain', () => ({
	createAgent: vi.fn().mockReturnValue({stream: mockAgentStream}),
	HumanMessage: class HumanMessage {
		constructor(public content: string) {}
	},
	AIMessageChunk: MockAIMessageChunk,
}));
vi.mock('./tools/clean.ts', () => ({cleanEmail: {}}));
vi.mock('./tools/gmail.ts', () => ({
	manageEmail: {},
	listEmail: {},
	readEmail: {},
	archiveEmail: {},
	deleteEmail: {},
	spamEmail: {},
}));
vi.mock('./tools/calendar.ts', () => ({
	manageCalendar: {},
	listEvents: {},
	createEvent: {},
}));
vi.mock('./tools/tasks.ts', () => ({
	manageTasks: {},
	listTasks: {},
	completeTask: {},
	updateTask: {},
	createTask: {},
}));
vi.mock('./model.ts', () => ({model: {}}));
vi.mock('./agents-file.ts', () => ({
	loadAgentsFile: vi.fn().mockResolvedValue('agent file content'),
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

describe('supervisor agent (index.ts)', () => {
	it('initializes database and checkpointer on startup', () => {
		expect(mockInitDatabase).toHaveBeenCalledTimes(1);
		expect(mockCheckpointerSetup).toHaveBeenCalledTimes(1);
	});

	it('streams response for non-empty input', () => {
		expect(mockAgentStream).toHaveBeenCalledTimes(1);
		expect(mockStdoutWrite).toHaveBeenCalledWith('response');
	});

	it('skips empty input', () => {
		// Only 1 stream call despite 3 question calls (empty is skipped, exit breaks)
		expect(mockAgentStream).toHaveBeenCalledTimes(1);
	});

	it('closes readline and pool on exit', () => {
		expect(mockRlClose).toHaveBeenCalled();
		expect(mockPoolEnd).toHaveBeenCalled();
	});
});
