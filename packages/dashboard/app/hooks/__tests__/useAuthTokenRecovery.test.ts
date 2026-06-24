import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AUTH_TOKEN_RECOVERY_REQUIRED_EVENT } from "../../auth";
import { useAuthTokenRecovery } from "../useAuthTokenRecovery";

describe("useAuthTokenRecovery", () => {
  it("opens when the daemon auth-failure event fires", () => {
    const { result } = renderHook(() => useAuthTokenRecovery());

    expect(result.current.open).toBe(false);

    act(() => {
      window.dispatchEvent(new Event(AUTH_TOKEN_RECOVERY_REQUIRED_EVENT));
    });

    expect(result.current.open).toBe(true);
  });
});
