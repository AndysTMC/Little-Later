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
				className="ll-page flex h-full w-full flex-col items-center justify-center gap-y-4 px-10 text-center"
			>
				<h1 className="text-2xl font-extrabold">
					Something went wrong
				</h1>
				<p className="text-sm">
					Your data is safe. Reload Little Later to carry on.
				</p>
				<button
					type="button"
					className="h-10 cursor-pointer rounded-lg border px-6 text-sm font-semibold"
					onClick={this.handleReload}
				>
					Reload
				</button>
			</div>
		);
	}
}

export { LUIErrorBoundary };
