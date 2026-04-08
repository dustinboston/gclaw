# Winbox

Winbox is an AI personal assistant built with Node.js, TypeScript, LangChain, LangGraph, and OpenAI.

## Features

- **Email Inbox Cleanup**: Currently features a `clean_email` tool that utilizes Google APIs to help manage and clean up your email inbox.
- **Calendar Tool (Planned)**: Upcoming support for managing daily agendas and calendar events.

## Prerequisites

Before running the project, ensure you have the following installed and configured:

- **Node.js**
- **pnpm** (used as the package manager)
- A `.env` file in the root directory with the necessary environment variables:
  - OpenAI API key
  - Google API credentials

## Installation

Install the project dependencies using pnpm:

```bash
pnpm install
```

## Authorization

Before running the app for the first time (or if you get an `invalid_grant` error), you need to authorize with Google:

```bash
pnpm authorize
```

This opens your browser for Google sign-in, exchanges the authorization code for tokens, and saves them to `.tokens.json`. You only need to do this once unless the token is revoked or expires.

## Usage

Run the application:

```bash
pnpm start
```
