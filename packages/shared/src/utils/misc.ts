export const capitalize = (str: string): string => {
	return str.charAt(0).toUpperCase() + str.slice(1);
};

export const cloneObject = <T>(obj: T): T => {
	return JSON.parse(JSON.stringify(obj));
};

export const fakeWait = async ({
	waitPeriod,
}: { waitPeriod?: number } = {}) => {
	await new Promise((resolve) => setTimeout(resolve, waitPeriod ?? 400));
};

export const getDomainFromUrl = (url: string): string => {
	const urlObj = new URL(url);
	return urlObj.hostname.replace("www.", "");
};
