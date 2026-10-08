import {
  addUserTurn,
  appendAssistantContent,
  createConversation,
  finishAssistantTurn,
  setNodeMeta,
  startAssistantTurn,
  type ConversationGraph,
  type GraphError,
  type NodeId,
  type Result,
} from "@diagram-4-llm/core";

export const DEMO_CONVERSATION_ID = "demo-planning-a-feature";

/**
 * Shown where a model name would be. The answers were written for the demo,
 * not generated, and the label must not suggest otherwise.
 */
export const DEMO_MODEL = "example (hand-written)";

type DemoTurn =
  | {
      readonly kind: "user";
      readonly id: NodeId;
      readonly parentId: NodeId | null;
      readonly content: string;
    }
  | {
      readonly kind: "assistant";
      readonly id: NodeId;
      readonly parentId: NodeId;
      readonly content: string;
      readonly title: string;
    };

// Creation order matters: the reading pane opens on the newest branch, so
// the deepest branch is written last.
const TURNS: readonly DemoTurn[] = [
  {
    kind: "user",
    id: "demo-q1",
    parentId: null,
    content:
      "I'm the product manager of an invoicing app for small businesses, with about 2,000 paying customers. Many of them ask for recurring invoices. Help me plan the feature from the problem to the launch.",
  },
  {
    kind: "assistant",
    id: "demo-a1",
    parentId: "demo-q1",
    title: "Plan for recurring invoices",
    content: `A plan in four parts:

1. **Problem.** Confirm who needs this and how they work around it today. Requests count only part of the demand: look at how many customers duplicate the same invoice every month.
2. **Scope.** Decide the smallest version that removes the workaround.
3. **Success.** Agree on the numbers that show it worked before you build it.
4. **Rollout.** Release it in stages, so a mistake reaches a few customers rather than all 2,000.

Recurring invoices send money requests without anyone looking at them, so mistakes are costly. That makes scope and rollout the parts that need the most care. Where would you like to start?`,
  },
  {
    kind: "user",
    id: "demo-q2-scope",
    parentId: "demo-a1",
    content: "Start with scope. What should the first version include?",
  },
  {
    kind: "assistant",
    id: "demo-a2-scope",
    parentId: "demo-q2-scope",
    title: "Scope of the first version",
    content: `Build what replaces the monthly copy-and-send, and nothing more.

**In the first version**
- Turn an existing invoice into a template with a schedule: weekly, monthly or yearly.
- Create each invoice as a draft, or send it automatically, as the customer chooses.
- A list of upcoming invoices, with pause and stop.
- An email to the business owner whenever an invoice is sent.

**Later**
- Card payments collected automatically.
- Amounts that change from one invoice to the next, such as usage-based billing.
- Custom schedules, such as "the last working day of the month".

Drafts by default keep the first version safe: nothing reaches a client until the owner trusts the schedule.`,
  },
  {
    kind: "assistant",
    id: "demo-a2-scope-short",
    parentId: "demo-q2-scope",
    title: "Scope in short",
    content:
      "A template with a weekly, monthly or yearly schedule, drafts or automatic sending, and a list of upcoming invoices with pause and stop. Automatic payments and changing amounts come later.",
  },
  {
    kind: "user",
    id: "demo-q3-scope",
    parentId: "demo-a2-scope",
    content:
      "Engineering estimates six weeks for this scope, and we have four. What do we cut?",
  },
  {
    kind: "assistant",
    id: "demo-a3-scope",
    parentId: "demo-q3-scope",
    title: "Fitting into four weeks",
    content: `Cut options, not the safety net:

| Item | Decision | Why |
| --- | --- | --- |
| Weekly and yearly schedules | Cut | Most repeated invoices in your data are monthly. |
| Automatic sending | Cut | Drafts deliver most of the value with none of the risk of wrong invoices going out. |
| Upcoming invoices, pause and stop | Keep | Without them a schedule cannot be corrected. |
| Email on every invoice | Keep | It is how owners notice a mistake. |

Monthly drafts only is a smaller launch, but an honest one: it removes the copying, and automatic sending can follow once you trust the schedules.`,
  },
  {
    kind: "user",
    id: "demo-q2-metrics",
    parentId: "demo-a1",
    content: "How will we know the feature worked?",
  },
  {
    kind: "assistant",
    id: "demo-a2-metrics",
    parentId: "demo-q2-metrics",
    title: "Measuring success",
    content: `Measure the behaviour it should change, not the clicks on it:

- **Adoption:** the share of customers who invoice the same client every month and set up at least one schedule within 60 days.
- **Effect:** the time between an invoice falling due and being sent, for scheduled invoices compared with manual ones.
- **Retention:** cancellations among customers who use schedules, compared with similar customers who do not.
- **Guardrail:** support tickets about wrong or unexpected invoices. This one should stay near zero.

Write down today's values before the launch. Without a baseline, any number afterwards looks like success.`,
  },
  {
    kind: "user",
    id: "demo-q2-rollout",
    parentId: "demo-a1",
    content: "Plan the rollout.",
  },
  {
    kind: "assistant",
    id: "demo-a2-rollout",
    parentId: "demo-q2-rollout",
    title: "Rollout in three stages",
    content: `Three stages, each behind a feature flag:

1. **Internal, week 1.** Your team bills a test account on short schedules, so a month of invoices happens in a day.
2. **Beta, weeks 2 to 5.** 50 customers who asked for the feature, invited by email. Drafts only, so every invoice is reviewed before it is sent. Talk to ten of them.
3. **Everyone, week 6.** Switch the flag on for all customers and announce it in the app.

Move to the next stage only when the guardrail holds: no invoice sent twice, to the wrong client or for the wrong amount.`,
  },
  {
    kind: "user",
    id: "demo-q3-risks",
    parentId: "demo-a2-rollout",
    content: "What could go wrong during the beta?",
  },
  {
    kind: "assistant",
    id: "demo-a3-risks",
    parentId: "demo-q3-risks",
    title: "Risks in the beta",
    content: `The risks worth planning for:

- **Duplicate invoices** if a scheduled job runs twice. Give each invoice a key made of the schedule and the date, so a second run finds it already created.
- **Wrong dates** around time zones and short months. Decide now what "the 31st" means in February.
- **Silence.** If beta customers simply stop using schedules, you learn nothing. Ask for ten conversations up front and book them.
- **A stale template.** A price change on the template must apply to future invoices only, never to ones already sent.`,
  },
  {
    kind: "user",
    id: "demo-q3-invite",
    parentId: "demo-a2-rollout",
    content: "Draft the email that invites customers to the beta.",
  },
  {
    kind: "assistant",
    id: "demo-a3-invite",
    parentId: "demo-q3-invite",
    title: "Beta invitation email",
    content: `**Subject:** You asked for recurring invoices. Want to try them first?

Hi {first name},

You told us you send the same invoices every month. We have built recurring invoices, and we are inviting 50 customers to try them before everyone else.

During the beta, each scheduled invoice is created as a draft, so nothing reaches your clients until you have checked it. You can pause or stop a schedule at any time.

If you join, we would like 20 minutes of your time in the first two weeks to hear what works and what does not.

[Join the beta]

Thank you for asking for this,
{your name}`,
  },
  {
    kind: "user",
    id: "demo-q4-invite",
    parentId: "demo-a3-invite",
    content:
      "Now write the in-app announcement for everyone else, for when the feature is released to all customers.",
  },
  {
    kind: "assistant",
    id: "demo-a4-invite",
    parentId: "demo-q4-invite",
    title: "Announcement for everyone",
    content: `**New: recurring invoices.** Set an invoice to repeat every month and we will prepare it for you on schedule. Tested by 50 of your fellow customers.

[Set up a schedule] · [Not now]

Keep it to two lines: the people who need it recognise the problem at once, and the rest can dismiss it without reading further.`,
  },
];

const START = Date.parse("2026-10-01T09:00:00.000Z");
const at = (minute: number) => new Date(START + minute * 60_000).toISOString();

/**
 * A branched product conversation that shows the app without a provider: a
 * fork into three topics, a second fork inside one of them, two versions of
 * one answer, and titles on the map. Each branch builds only on its own
 * turns, as the context of a real branch would.
 * It is built with the same operations as a real conversation, so it obeys
 * every invariant and its context records are computed, not invented.
 */
export function demoConversation(): Result<ConversationGraph, GraphError> {
  const created = createConversation({
    id: DEMO_CONVERSATION_ID,
    title: "Demo: planning a feature launch",
    createdAt: at(0),
  });
  if (!created.ok) return created;
  let graph = created.value;

  for (const [index, turn] of TURNS.entries()) {
    const added = addTurn(graph, turn, at(index + 1));
    if (!added.ok) return added;
    graph = added.value;
  }
  return { ok: true, value: graph };
}

function addTurn(
  graph: ConversationGraph,
  turn: DemoTurn,
  createdAt: string,
): Result<ConversationGraph, GraphError> {
  if (turn.kind === "user") {
    return addUserTurn(graph, {
      id: turn.id,
      parentId: turn.parentId,
      refs: [],
      content: turn.content,
      createdAt,
    });
  }
  const started = startAssistantTurn(graph, {
    id: turn.id,
    parentId: turn.parentId,
    createdAt,
    // The adapter field has no value for "no provider"; no endpoint is
    // recorded, and the model label says the answer was written by hand.
    adapter: "openai-compatible",
    model: DEMO_MODEL,
    params: {},
    systemPrompt: null,
  });
  if (!started.ok) return started;
  const written = appendAssistantContent(started.value, turn.id, turn.content);
  if (!written.ok) return written;
  const finished = finishAssistantTurn(written.value, turn.id, {
    status: "complete",
    stopReason: "end",
  });
  if (!finished.ok) return finished;
  return setNodeMeta(finished.value, turn.id, { title: turn.title });
}
