import {
	Component as ReactComponent,
	type ErrorInfo,
	type ReactNode,
} from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

// Catches a rendering failure anywhere in the popup, so one broken screen
// shows a way back instead of an empty window. Uses the page tokens from
// index.css, since the theme context may be what failed.
class LUIErrorBoundary extends ReactComponent<Props, State> {
	state: State = { failed: false };

	static getDerivedStateFromError(): State {
		return { failed: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("The popup failed to render.", error, info);
	}

	private handleReload = () => {
		window.location.hash = "#/";
		window.location.reload();
	};

	render() {
		if (!this.state.failed) {
			return this.props.children;
		}
		return (
			<div
				role="alert"
				className="ll-page flex h-full w-full flex-col items-center justify-center gap-y-4 px-6 text-center"
			>
				<h1 className="text-2xl font-semibold tracking-tight">
					Something went wrong
				</h1>
				<p className="max-w-xs text-sm opacity-75">
					Your data is safe. Reload Little Later to carry on.
				</p>
				<button
					type="button"
					className="ll-accent-fill h-11 cursor-pointer rounded-xl px-6 text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
					onClick={this.handleReload}
				>
					Reload
				</button>
			</div>
		);
	}
}

export { LUIErrorBoundary };
