import { twMerge } from "tailwind-merge";
import { LUIDateNumInput } from "../LUIDateNumInput/Component";
import { LUIMeridiumInput } from "../LUIMeridiumInput/Component";
import { LUILabel } from "../LUILabel/Component";
import { LDate } from "little-shared/types";
import { LDateUtl } from "little-shared/utils/datetime";

const Component = ({
	className,
	name,
	date,
	onChange,
}: {
	className?: string;
	name: string;
	date: LDate;
	onChange: (date: LDate) => void;
}) => {
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
					passedValue={LDateUtl.getYear(date)}
					onChange={(value) =>
						onChange(LDateUtl.setYear(date, value))
					}
					onShift={(shift) =>
						onChange(LDateUtl.shiftYear(date, shift))
					}
					minValue={1000}
					maxValue={9999}
					maxLength={4}
					className={`w-16`}
				/>
				<LUIDateNumInput
					name={"MM"}
					passedValue={LDateUtl.getMonth(date) + 1}
					onChange={(value) =>
						onChange(LDateUtl.setMonth(date, value - 1))
					}
					onShift={(shift) =>
						onChange(LDateUtl.shiftMonth(date, shift))
					}
					minValue={1}
					maxValue={12}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIDateNumInput
					name={"DD"}
					passedValue={LDateUtl.getDay(date)}
					onChange={(value) => onChange(LDateUtl.setDay(date, value))}
					onShift={(shift) =>
						onChange(LDateUtl.shiftDay(date, shift))
					}
					minValue={1}
					maxValue={31}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIDateNumInput
					name={"hh"}
					passedValue={LDateUtl.getHour12HF(date)}
					onChange={(value) =>
						onChange(LDateUtl.setHour(date, value))
					}
					onShift={(shift) =>
						onChange(LDateUtl.shiftHour(date, shift))
					}
					minValue={1}
					maxValue={12}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIDateNumInput
					name={"mm"}
					passedValue={LDateUtl.getMinute(date)}
					onChange={(value) =>
						onChange(LDateUtl.setMinute(date, value))
					}
					onShift={(shift) => {
						onChange(LDateUtl.shiftMinute(date, shift));
					}}
					minValue={0}
					maxValue={59}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIMeridiumInput
					passedValue={LDateUtl.getMerideum(date)}
					onShift={(direction) =>
						onChange(LDateUtl.shiftMerideum(date, direction))
					}
					className={`w-10`}
				/>
			</div>
		</div>
	);
};

export { Component as LUIDateTimeInput };
