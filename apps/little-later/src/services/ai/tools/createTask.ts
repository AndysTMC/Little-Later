import { LDATE_FORMAT } from "little-shared/constants";
import {
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
	LRECURRING_TYPE,
} from "little-shared/enums";
import OpenAI from "openai";

const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: "function",
	function: {
		name: "create_task",
		description: "Creates a task with the given information",
		parameters: {
			type: "object",
			properties: {
				information: {
					type: "string",
					description: "The information of the task",
				},
				label: {
					type: "string",
					description: "The label for the task",
				},
				priority: {
					type: "string",
					description: "The priority of the task",
					enum: [
						LTASK_PRIORITY.LOW,
						LTASK_PRIORITY.MEDIUM,
						LTASK_PRIORITY.HIGH,
					],
				},
				schedule: {
					anyOf: [
						{
							type: "object",
							properties: {
								deadlineInfo: {
									type: "object",
									properties: {
										deadlineDate: {
											type: "string",
											description: `The date of the deadline (format: ${LDATE_FORMAT})`,
										},
									},
									required: ["deadlineDate"],
									additionalProperties: false,
								},
								type: {
									const: LTASK_SCHEDULE_TYPE.DUE,
									description:
										"The type of the task schedule",
								},
							},
							required: ["deadlineInfo", "type"],
							additionalProperties: false,
						},
						{
							type: "object",
							properties: {
								recurringInfo: {
									anyOf: [
										{
											type: "object",
											properties: {
												time: {
													type: "string",
													description: `The time of the recurring task (format: ${LDATE_FORMAT})`,
												},
												type: {
													const: LRECURRING_TYPE.DAILY,
													description:
														"The type of the recurring task",
												},
											},
											required: ["time", "type"],
											additionalProperties: false,
										},
										{
											type: "object",
											properties: {
												time: {
													type: "string",
													description: `The time of the recurring task (format: ${LDATE_FORMAT})`,
												},
												type: {
													const: LRECURRING_TYPE.WEEKLY,
													description:
														"The type of the recurring task",
												},
												weekDay: {
													type: "number",
													description:
														"The week day of the recurring task (0-6) (0 = Sunday, 6 = Saturday)",
												},
											},
											required: [
												"time",
												"type",
												"weekDay",
											],
											additionalProperties: false,
										},
										{
											type: "object",
											properties: {
												day: {
													type: "number",
													description:
														"The day of the recurring task (1-28)",
												},
												time: {
													type: "string",
													description: `The time of the recurring task (format: ${LDATE_FORMAT})`,
												},
												type: {
													const: LRECURRING_TYPE.MONTHLY,
													description:
														"The type of the recurring task",
												},
											},
											required: ["day", "time", "type"],
											additionalProperties: false,
										},
										{
											type: "object",
											properties: {
												type: {
													const: LRECURRING_TYPE.YEARLY,
													description:
														"The type of the recurring task",
												},
												time: {
													type: "string",
													description: `The time of the recurring task (format: ${LDATE_FORMAT})`,
												},
												day: {
													type: "number",
													description:
														"The day of the recurring task (1-28)",
												},
												month: {
													type: "number",
													description:
														"The month of the recurring task (0-11)",
												},
											},
											required: [
												"type",
												"time",
												"day",
												"month",
											],
											additionalProperties: false,
										},
									],
								},
								type: {
									const: LTASK_SCHEDULE_TYPE.RECURRING,
									description:
										"The type of the task schedule",
								},
							},
							required: ["recurringInfo", "type"],
							additionalProperties: false,
						},
						{
							type: "object",
							properties: {
								type: {
									const: LTASK_SCHEDULE_TYPE.ADHOC,
									description:
										"The type of the task schedule",
								},
							},
							required: ["type"],
							additionalProperties: false,
						},
					],
					additionalProperties: false,
				},
			},
			required: ["information", "label", "priority", "schedule"],
			additionalProperties: false,
		},
		strict: true,
	},
};

export { tool as createTaskTool };
