# Grok Bot adaptations (branch `grokbot`)
Upstream: gaurabhmathure/product-walkthrough-video-skill (MIT). Upstream code untouched.
| Upstream (Claude Code) | Grok Bot |
|---|---|
| `SKILL.md` loaded by Claude Code from ~/.claude/skills | Moved verbatim to `SKILL.upstream.md`; new `SKILL.md` with Grok Bot frontmatter, box paths, tool mapping |
| `AskUserQuestion` tool (step 1) | Ask in chat; subagents report to parent |
| Claude Bash/Read tools implied | Shell / Read tools on the box |
| README install: `~/.claude/skills/...` symlink | Clone at /workspace/demo-studio/tools/…; registered via /home/box/agent-data/workflows/demo-studio/SKILL.md |
| `pip3 install --user edge-tts` (blocked by PEP 668 on box) | venv at /workspace/demo-studio/tools/.venv (`scripts/grokbot_setup.sh`) |
| No runnable example | `scripts/grokbot_e2e/` (mock page, script.json, run.sh) — full audio→slides→record→concat→mix→mux in plain shell |
No slash commands, hooks, MCP configs, or claude/codex CLI calls exist upstream. Note: E2E skips the gradient-backdrop/mask compositing (render_bg_assets.js), which is documented, not scripted, upstream.
