# Using Hearloop with AI Assistants (Claude, Cursor, GitHub Copilot)

**Before working on Hearloop code, read this file once per session.**

## The Three Files

You have three markdown files to avoid wasting tokens re-reading the codebase:

### 1. **`.context.md`** (2 min read)
**Start here.** 30-second refresher on what Hearloop is, where files are, and how pieces fit together.

### 2. **`copilot-instructions.md`** (5 min read)
**Main reference.** Full architecture, all key files, conventions, and patterns. Read this when:
- Starting a new task
- Confused about architecture
- Need full context on a module

### 3. **`.patterns.md`** (5 min read)
**Code style guide.** How we write code in this project. Use when:
- Writing new components or jobs
- Adding routes or functions
- Need to match existing patterns

## How to Use These Files

### For Claude (VS Code Copilot Chat)
1. **First message:** Ask: *"Read `.context.md`, then help me with [task]"*
2. Or paste a file path + ask the task — I'll reference the instruction files automatically

### For Cursor
Add to `.cursorrules` or your Cursor settings:
```
When working on Hearloop (in /Hearloop directory):
1. Always reference copilot-instructions.md for architecture
2. Check .patterns.md before writing code
3. Mention .context.md if context seems missing
```

### For GitHub Copilot Chat
Reference files in your message:
```
"Based on .context.md and .patterns.md, help me add a new job to..."
```

## Typical Workflow

**Scenario: Adding a new webhook delivery mechanism**

1. Read `.context.md` (30 sec) → Understand webhook delivery flow
2. Open `copilot-instructions.md` → Find relevant job processor pattern
3. Open `.patterns.md` → See job handler code pattern
4. Ask AI: *"I need to modify the webhook delivery job. [Attach files]"*

AI has context without re-reading entire codebase. ✅

## Pro Tips for Token Efficiency

### DO
- ✅ Reference specific file sections: *"In copilot-instructions.md under 'Job Processors', ..."*
- ✅ Ask questions that point to specific sections
- ✅ Paste one or two key files, not the whole codebase
- ✅ Use `.patterns.md` to ask: *"Write a Kysely query following project patterns"*

### DON'T
- ❌ Paste the entire `node_modules`
- ❌ Ask generic TypeScript questions (AI has general knowledge)
- ❌ Skip reading `.context.md` first
- ❌ Paste 10+ files when 2 would do

## Key Concepts to Remember
- **Monorepo:** Turbo orchestrates (read `copilot-instructions.md` for structure)
- **Multi-tenant:** API keys isolate partners
- **Queue-based:** Transcription & analysis happen asynchronously
- **Type-safe:** No `any`, strict TypeScript everywhere

## If Something's Wrong in These Files

These instruction files can become outdated. If something contradicts the actual code:

1. **Check the actual codebase first**
2. **Tell the AI:** *"These files say X, but I see Y in the code. Let's follow the code."*
3. **Update the files yourself** if the codebase changed

## Environment Setup (For AI to Know)

When setting up for the first time:
```bash
npm install              # Install deps
npm run dev              # Start dev server
# Env vars: See copilot-instructions.md "ENV Vars Needed"
```

---

**Bottom Line:** These three files replace reading your entire codebase. Use them to save tokens and time with every AI session.

*Last Updated: April 2026*
