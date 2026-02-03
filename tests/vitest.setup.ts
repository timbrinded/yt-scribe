import { afterAll } from "vitest";
import { closeDb } from "../src/db";

afterAll(() => {
	closeDb();
});
