import { useContext } from "react";
import { LocalSocketContext } from "../contexts/LocalSocket";

const useLocalSocket = () => {
	const socket = useContext(LocalSocketContext);
	return socket;
};

export { useLocalSocket };
