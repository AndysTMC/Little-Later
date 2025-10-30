import { LTime } from "little-shared/types";
import { twMerge } from "tailwind-merge";
import { LUILabel } from "../LUILabel/Component";
import { LUIDateNumInput } from "../LUIDateNumInput/Component";
import { LUIMeridiumInput } from "../LUIMeridiumInput/Component";
import { LTimeUtl } from "little-shared/utils/datetime";

const Component = ({
	className,
	name,
	time,
	onChange,
}: {
	className?: string;
	name: string;
	time: LTime;
	onChange: (time: LTime) => void;
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
					name={"hh"}
					passedValue={LTimeUtl.getHour12HF(time)}
					onChange={(value) =>
						onChange(LTimeUtl.setHour(time, value))
					}
					onShift={(shift) =>
						onChange(LTimeUtl.shiftHour(time, shift))
					}
					minValue={1}
					maxValue={12}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIDateNumInput
					name={"mm"}
					passedValue={LTimeUtl.getMinute(time)}
					onChange={(value) =>
						onChange(LTimeUtl.setMinute(time, value))
					}
					onShift={(shift) => {
						onChange(LTimeUtl.shiftMinute(time, shift));
					}}
					minValue={0}
					maxValue={59}
					maxLength={2}
					className={`w-8`}
				/>
				<LUIMeridiumInput
					passedValue={LTimeUtl.getMerideum(time)}
					onShift={(direction) =>
						onChange(LTimeUtl.shiftMerideum(time, direction))
					}
					className={`w-10`}
				/>
			</div>
		</div>
	);
};

export { Component as LUITimeInput };
