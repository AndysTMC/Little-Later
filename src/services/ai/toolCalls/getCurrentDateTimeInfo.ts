import {
	WEEKDAY_NAMES,
	deviceZone,
	hour12,
	meridiem,
} from "../../../utils/dates";

const toolCall = () => {
	const now = Temporal.Now.zonedDateTimeISO(deviceZone());
	const monthName = now.toLocaleString("en-US", { month: "long" });
	const minutes = String(now.minute).padStart(2, "0");
	return `
                Latest Date & Time Information:
                - Year: ${now.year}
                - Month: ${monthName} (${now.month})
                - Day: ${now.day}
                - Week Day: ${WEEKDAY_NAMES[now.dayOfWeek - 1]}
                - Time (24-hour): ${now.hour}:${minutes}
                - Time (12-hour, preferred): ${hour12(now.hour)}:${minutes} ${meridiem(now.hour)}
                - Time zone: ${now.timeZoneId}
            `;
};

export { toolCall as getCurrentDateTimeInfoToolCall };
