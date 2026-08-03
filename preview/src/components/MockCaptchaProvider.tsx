import { CaptchaContext } from "@wandercom/website-registry/components/Form/CaptchaProvider/CaptchaContext";

const MOCK_CAPTCHA_VALUE = {
  capToken: "preview-token",
  capLoading: false,
  capResetting: false,
  capError: null as Error | null,
};

export function MockCaptchaProvider({ children }: { children: React.ReactNode }) {
  return <CaptchaContext.Provider value={MOCK_CAPTCHA_VALUE}>{children}</CaptchaContext.Provider>;
}
