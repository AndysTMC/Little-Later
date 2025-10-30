import { LDateUtl } from "little-shared/utils/datetime";

const toolCall = () => {
	const year = LDateUtl.getYear();
	const month = LDateUtl.getMonth();
	const monthName = LDateUtl.getMonthName(month);
	const day = LDateUtl.getDay();
	const weekDay = LDateUtl.getWeekDay();
	const weekDayName = LDateUtl.getWeekDayName(weekDay);
	const hours24 = LDateUtl.getHour();
	const hours12 = LDateUtl.getHour12HF();
	const meridiem = LDateUtl.getMerideum();
	const minutes = LDateUtl.getMinute();
	return `
                Latest Date & Time Information:
                - Year: ${year}
                - Month: ${monthName} (${month})
                - Day: ${day}
                - Week Day: ${weekDayName}
                - Time (24-hour): ${hours24}:${minutes}
                - Time (12-hour, preferred): ${hours12}:${minutes} ${meridiem}
            `;
};

export { toolCall as getCurrentDateTimeInfoToolCall };
