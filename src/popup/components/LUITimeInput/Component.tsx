import { twMerge } from "tailwind-merge";
import { LUILabel } from "../LUILabel/Component";
import { LUIDateNumInput } from "../LUIDateNumInput/Component";
import { LUIMeridiumInput } from "../LUIMeridiumInput/Component";
import { hour12, meridiem, withHour12 } from "../../../utils/dates";

// Edits a wall-clock time, "HH:mm".
const Component = ({
	className,
	name,
	time,
	onChange,
}: {
	className?: string;
	name: string;
	time: string;
	onChange: (time: string) => void;
}) => {
	const clock = Temporal.PlainTime.from(time);
	const emit = (next: Temporal.PlainTime) =>
		onChange(next.toString({ smallestUnit: "minute" }));
	const shift = (duration: Parameters<Temporal.PlainTime["add"]>[0]) =>
		emit(clock.add(duration));

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
					name={"hh"}
					passedValue={hour12(clock.hour)}
					onChange={(hour) =>
						emit(clock.with({ hour: withHour12(clock.hour, hour) }))
					}
					onShift={(hours) => shift({ hours })}
					minValue={1}
					maxValue={12}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIDateNumInput
					name={"mm"}
					passedValue={clock.minute}
					onChange={(minute) => emit(clock.with({ minute }))}
					onShift={(minutes) => shift({ minutes })}
					minValue={0}
					maxValue={59}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIMeridiumInput
					passedValue={meridiem(clock.hour)}
					onShift={(direction) => shift({ hours: 12 * direction })}
					className={`w-10`}
				/>
			</div>
		</div>
	);
};

export { Component as LUITimeInput };
