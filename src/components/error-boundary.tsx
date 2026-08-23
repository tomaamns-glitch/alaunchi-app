import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportRenderError } from "@/services/error-reporter";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRenderError(error, info.componentStack ?? undefined);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-background text-foreground text-center px-6 py-16">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-lg font-medium">Algo ha fallado.</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Se ha enviado un reporte automático para que lo revisemos.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
