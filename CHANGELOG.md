# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). While the version is below 1.0,
the data format and the interface may still change between minor versions.

## [Unreleased]

Everything so far, to be released as 0.1.0 when phase 1 of the
[plan](docs/PLAN.md) ends. You can hold branching conversations with an
Anthropic model or any OpenAI-compatible server, entirely in the browser. Try
it at https://productpope.github.io/diagram-4-llm/.

### Conversations as graphs

- Fork at any message by editing or regenerating it; nothing is overwritten,
  and each version of a message stays reachable.
- "Branch from here" on any message, from the conversation or from the map.
- A context inspector shows the exact messages a branch will send before you
  send them. Each branch sends only its own path.
- The model is chosen for each answer from a configured list; a branch keeps
  the model that answered last.
- Answers stream in, can be cancelled, and keep their partial text when a
  request fails. The reason an answer ended is recorded.
- Answers are rendered as Markdown with raw HTML dropped and images shown as
  links.

### The map

- The whole conversation as a tree on a canvas, with automatic layout, pan,
  zoom and collapsible subtrees.
- Choosing a turn on the map shows its branch and scrolls the conversation to
  it. The map follows the selected branch.
- Optional short titles for answers, written by a model chosen in the
  settings.
- On wide screens the map can be minimized to a strip that outlines the
  selected branch and scrolls to a turn when one is chosen.
- Keyboard navigation: arrow keys move between turns, Enter shows a branch,
  E forks from a message of yours, and / focuses the composer.

### Getting started

- A welcome page, written as a conversation, explains the app and how it
  treats your data.
- A demo conversation, planning a feature launch, opens without any provider.
- A setup assistant chooses the provider, tests the connection and lists the
  provider's models. Starting a new conversation without a provider opens the
  settings.

### Your data

- Conversations are stored in the browser (IndexedDB) and can be renamed and
  deleted.
- Export and import of conversations as JSON files. An import never
  overwrites an existing conversation.

### Accessibility

- Usable 320 pixels wide (WCAG 1.4.10): below 800 pixels the app shows the
  conversation list, the conversation or the map, one at a time.
- A skip link to the conversation, focus rings with 3:1 contrast, landmarks
  and headings on every page, and reduced motion respected.

### Security

- A strict Content Security Policy: no inline scripts and no third-party
  scripts, fonts or analytics.
- The API key stays in the browser and is sent only to the configured
  provider.
- A [security policy](SECURITY.md) with private vulnerability reporting, and
  weekly Dependabot updates for packages and workflow actions.

[Unreleased]: https://github.com/ProductPope/diagram-4-llm/commits/main
