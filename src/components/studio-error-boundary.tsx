import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * FRONTIÈRE D'ERREUR DU STUDIO.
 *
 * Si un composant lève malgré les garde-fous, on affiche un message clair avec
 * un bouton « Recharger » au lieu d'une page blanche. Le projet en cours vit
 * dans le stockage du navigateur : il n'est jamais perdu.
 */
type Props = { children: ReactNode };
type State = { message: string | null };

export class StudioErrorBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : "Erreur inattendue" };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Studio — erreur d'affichage", error, info.componentStack);
  }

  override render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="surface-card max-w-md p-5 text-center">
          <h1 className="text-base font-semibold tracking-tight">L'affichage s'est interrompu</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Ton projet est conservé : rien n'est perdu. Recharge la page pour le retrouver.
          </p>
          <p className="mt-2 break-words font-mono text-[11px] text-muted-foreground">
            {this.state.message}
          </p>
          <button
            className="btn-base btn-primary mt-4 text-xs"
            onClick={() => window.location.reload()}
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }
}
