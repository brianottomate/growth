import { describe, expect, test } from "bun:test";
import { canOperateEmailDelivery } from "./email-delivery-role";

describe("email delivery roles", () => {
  test("only owners and admins can operate provider delivery", () => {
    expect(canOperateEmailDelivery("owner")).toBe(true);
    expect(canOperateEmailDelivery("admin")).toBe(true);
    expect(canOperateEmailDelivery("member")).toBe(false);
    expect(canOperateEmailDelivery(undefined)).toBe(false);
  });
});
