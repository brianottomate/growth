/**
 * Booking extraction from Meta API actions.
 * Ported from meta-tester/src/utils/bookings-helper.js
 *
 * Attribution Windows:
 * - 7d_click: Conversions from clicks within 7 days (Meta default)
 * - 1d_view: Conversions from views within 1 day (view-through)
 * - 28d_click: Conversions from clicks within 28 days
 *
 * Total Attribution = 28d_click + 1d_view
 */

export const STANDARD_ATTRIBUTION_WINDOWS = ['7d_click', '1d_view', '28d_click'] as const

export type AttributionWindow = '7d_click' | '1d_view' | '28d_click'

interface MetaAction {
  action_type: string
  value?: string
  '7d_click'?: string
  '1d_view'?: string
  '28d_click'?: string
  [key: string]: string | undefined
}

function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue
  const parsed = parseInt(String(value), 10)
  return isNaN(parsed) ? defaultValue : parsed
}

function safeParseFloat(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue
  const parsed = parseFloat(String(value))
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Extract booking count from Meta actions array for a given attribution window.
 */
export function getBookingsFromActions(
  actions: MetaAction[] | null | undefined,
  attributionWindow: AttributionWindow | null = null
): number {
  if (!actions || !Array.isArray(actions)) return 0

  if (attributionWindow) {
    // Look for purchase/omni_purchase with the specific attribution window
    const bookingAction = actions.find(
      (action) =>
        (action.action_type === 'purchase' || action.action_type === 'omni_purchase') &&
        action[attributionWindow] !== undefined
    )

    if (bookingAction) {
      return safeParseInt(bookingAction[attributionWindow], 0)
    }

    // Fallback: check for value in standard format
    const fallback = actions.find(
      (action) => action.action_type === 'purchase' || action.action_type === 'omni_purchase'
    )
    if (fallback) return safeParseInt(fallback.value, 0)

    return 0
  }

  // No attribution window — use default value field
  const bookingAction = actions.find(
    (action) => action.action_type === 'purchase' || action.action_type === 'omni_purchase'
  )
  return bookingAction ? safeParseInt(bookingAction.value, 0) : 0
}

/**
 * Extract purchase conversion value from Meta action_values array.
 * Same structure as actions but values are dollar amounts (strings).
 */
export function getPurchaseValueFromActions(
  actionValues: MetaAction[] | null | undefined,
  attributionWindow: AttributionWindow | null = null
): number {
  if (!actionValues || !Array.isArray(actionValues)) return 0

  const purchaseAction = actionValues.find(
    (action) =>
      action.action_type === 'purchase' || action.action_type === 'omni_purchase'
  )

  if (!purchaseAction) return 0

  if (attributionWindow && purchaseAction[attributionWindow] !== undefined) {
    return safeParseFloat(purchaseAction[attributionWindow], 0)
  }

  return safeParseFloat(purchaseAction.value, 0)
}

/**
 * Get total bookings with full attribution (28d_click + 1d_view).
 * This is the standard calculation for growth tracker reporting.
 */
export function getTotalBookingsWithAttribution(
  actions: MetaAction[] | null | undefined,
  use28DayClick = true
): { total: number; click: number; view: number; clickWindow: AttributionWindow } {
  const clickWindow: AttributionWindow = use28DayClick ? '28d_click' : '7d_click'
  const clickBookings = getBookingsFromActions(actions, clickWindow)
  const viewBookings = getBookingsFromActions(actions, '1d_view')

  return {
    total: clickBookings + viewBookings,
    click: clickBookings,
    view: viewBookings,
    clickWindow,
  }
}
