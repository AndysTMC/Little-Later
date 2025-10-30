import { createContext, ReactNode, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { useLLConfig } from "../hooks/useLLConfig";

const Context: React.Context<Socket | undefined> = createContext<
	Socket | undefined
>(undefined);

interface ProviderProps {
	children: ReactNode;
}

const ContextProvider: React.FC<ProviderProps> = ({ children }) => {
	const llConfig = useLLConfig();
	const socket = useMemo(() => {
		if (!llConfig.isEnabled) {
			return undefined;
		}
		return io(`http://localhost:${llConfig.port}`, {
			transports: ["websocket"],
			reconnection: true,
			reconnectionDelay: 1000,
		});
	}, [llConfig]);
	return <Context.Provider value={socket}>{children}</Context.Provider>;
};
export {
	Context as LocalSocketContext,
	ContextProvider as LocalSocketContextProvider,
};
