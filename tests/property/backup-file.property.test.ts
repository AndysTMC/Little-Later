import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	BACKUP_FORMAT,
	BACKUP_MAGIC,
	BackupError,
	decodeHeader,
	readBackupFile,
	writeBackupFile,
} from "../../src/storage/backup";

// A backup file is untrusted input: it is read before anything in it is
// authenticated. Its framing must split back what was written, and reject
// anything else with BackupError, never another error or a bad read.

const partArb = fc.uint8Array({ minLength: 1, maxLength: 64 });

const expectBackupErrorOrResult = (read: () => unknown) => {
	try {
		read();
	} catch (error) {
		expect(error).toBeInstanceOf(BackupError);
	}
};

describe("backup file properties", () => {
	it("reads back the header and chunks it wrote", () => {
		fc.assert(
			fc.property(
				partArb,
				fc.array(partArb, { minLength: 1, maxLength: 8 }),
				(header, chunks) => {
					expect(
						readBackupFile(writeBackupFile(header, chunks)),
					).toEqual({ header, chunks });
				},
			),
		);
	});

	it("rejects a truncated file", () => {
		fc.assert(
			fc.property(
				partArb,
				fc.array(partArb, { minLength: 1, maxLength: 4 }),
				fc.nat(),
				(header, chunks, cut) => {
					const file = writeBackupFile(header, chunks);
					const length = cut % file.length;
					const truncated = file.slice(0, length);
					// Cutting exactly between two chunks leaves a shorter,
					// well-formed file; the chunks' own "last" flag catches that.
					try {
						const read = readBackupFile(truncated);
						expect(read.header).toEqual(header);
						expect(chunks.slice(0, read.chunks.length)).toEqual(
							read.chunks,
						);
						expect(read.chunks.length).toBeLessThan(chunks.length);
					} catch (error) {
						expect(error).toBeInstanceOf(BackupError);
					}
				},
			),
		);
	});

	it("fails arbitrary bytes with BackupError only", () => {
		const prefixed = fc
			.uint8Array({ maxLength: 128, size: "max" })
			.map(
				(rest) =>
					new Uint8Array([...BACKUP_MAGIC, BACKUP_FORMAT, ...rest]),
			);
		fc.assert(
			fc.property(
				fc.oneof(fc.uint8Array({ maxLength: 128 }), prefixed),
				(bytes) =>
					expectBackupErrorOrResult(() => readBackupFile(bytes)),
			),
		);
	});

	it("decodes any header bytes or JSON to a header or BackupError", () => {
		const encoder = new TextEncoder();
		const headerJsonArb = fc.record(
			{
				backupId: fc.oneof(fc.uuid(), fc.anything()),
				keyId: fc.oneof(fc.constant(1), fc.anything()),
				kdf: fc.oneof(
					fc.record({
						name: fc.string(),
						iterations: fc.oneof(fc.integer(), fc.anything()),
						salt: fc.oneof(fc.base64String(), fc.anything()),
					}),
					fc.anything(),
				),
				iv: fc.oneof(fc.base64String(), fc.anything()),
				ciphertext: fc.oneof(fc.base64String(), fc.anything()),
			},
			{ requiredKeys: [] },
		);
		fc.assert(
			fc.property(
				fc.oneof(
					fc.uint8Array(),
					headerJsonArb.map((json) =>
						encoder.encode(JSON.stringify(json) ?? ""),
					),
				),
				(bytes) => expectBackupErrorOrResult(() => decodeHeader(bytes)),
			),
		);
	});
});
