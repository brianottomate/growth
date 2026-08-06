import "server-only";

/**
 * Render a design-system react-email template with placeholder props for the
 * transactional registry. Props come from `transactional_message.previewProps`
 * — placeholder strings ("{{magic_link_url}}"), never recipient data. The
 * package's registry types are Required<> at compile time; previews pass a
 * curated loose object and surface render errors instead of failing the page.
 */
export async function renderTransactionalPreview(
  templateKey: string,
  previewProps: Record<string, unknown>,
): Promise<
  { ok: true; html: string; text: string } | { ok: false; error: string }
> {
  try {
    const designSystemEmails = await import("@wandercom/design-system-emails");
    const composeEmail = designSystemEmails.composeEmail as (
      template: string,
      props: Record<string, unknown>,
    ) => Promise<{ html: string; text: string }>;
    const rendered = await composeEmail(templateKey, previewProps);
    return { ok: true, ...rendered };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : `Could not render ${templateKey}`,
    };
  }
}
