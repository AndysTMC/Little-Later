import { twMerge } from "tailwind-merge";
import { LUIDateNumInput } from "../LUIDateNumInput/Component";
import { LUIMeridiumInput } from "../LUIMeridiumInput/Component";
import { LUILabel } from "../LUILabel/Component";
import { hour12, meridiem, withHour12, zoned } from "../../../utils/dates";

// Edits an instant (epoch milliseconds) as a date and time in the device's
// zone.
const Component = ({
	className,
	name,
	value,
	onChange,
}: {
	className?: string;
	name: string;
	value: number;
	onChange: (value: number) => void;
}) => {
	const date = zoned(value);
	const set = (fields: Parameters<Temporal.ZonedDateTime["with"]>[0]) =>
		onChange(
			date.with(fields, { overflow: "constrain" }).epochMilliseconds,
		);
	const shift = (duration: Parameters<Temporal.ZonedDateTime["add"]>[0]) =>
		onChange(date.add(duration).epochMilliseconds);

	return (
		<div
			className={twMerge(
				`flex h-max w-full flex-col gap-y-1 rounded-lg`,
				className,
			)}
		>
			<div className={`h-max w-full`}>
				<LUILabel name={name} className="px-4" />
			</div>
			<div className={`flex w-full`}>
				<LUIDateNumInput
					name={"YYYY"}
					passedValue={date.year}
					onChange={(year) => set({ year })}
					onShift={(years) => shift({ years })}
					minValue={1000}
					maxValue={9999}
					maxLength={4}
					className={`w-16`}
				/>
				<LUIDateNumInput
					name={"MM"}
					passedValue={date.month}
					onChange={(month) => set({ month })}
					onShift={(months) => shift({ months })}
					minValue={1}
					maxValue={12}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIDateNumInput
					name={"DD"}
					passedValue={date.day}
					onChange={(day) => set({ day })}
					onShift={(days) => shift({ days })}
					minValue={1}
					maxValue={31}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIDateNumInput
					name={"hh"}
					passedValue={hour12(date.hour)}
					onChange={(hour) =>
						set({ hour: withHour12(date.hour, hour) })
					}
					onShift={(hours) => shift({ hours })}
					minValue={1}
					maxValue={12}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIDateNumInput
					name={"mm"}
					passedValue={date.minute}
					onChange={(minute) => set({ minute })}
					onShift={(minutes) => shift({ minutes })}
					minValue={0}
					maxValue={59}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIMeridiumInput
					passedValue={meridiem(date.hour)}
					onShift={(direction) => shift({ hours: 12 * direction })}
					className={`w-10`}
				/>
			</div>
		</div>
	);
};

export { Component as LUIDateTimeInput };
