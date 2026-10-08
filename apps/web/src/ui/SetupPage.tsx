import { Button } from "#components/ui/button";
import { Sparkles } from "lucide-react";
import type { ComponentProps } from "react";

import { Brand } from "./Brand";
import { SetupWizard } from "./SetupWizard";

interface Props extends ComponentProps<typeof SetupWizard> {
  readonly onOpenDemo: () => void;
  readonly onSkip: () => void;
  readonly demoReady: boolean;
}

/**
 * Setup on a page of its own. The demo and skipping stay one click away on
 * every step, so setup never stands between a visitor and the app.
 */
export function SetupPage({ onOpenDemo, onSkip, demoReady, ...wizard }: Props) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
        <Brand />
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={onOpenDemo} disabled={!demoReady}>
            <Sparkles aria-hidden="true" />
            Explore the demo
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </header>
      <main className="flex flex-1 p-6">
        <SetupWizard {...wizard} />
      </main>
    </div>
  );
}
