// 🔹 Immutable color map for consistent usage across the bot

/**
 * @readonly
 * @enum {number}
 */
const COLOUR_VALUES = Object.freeze({
    ADD: 0x00FF00,      // ✅ Green for adding events
    REMOVE: 0xFF0000,   // ✅ Red for removing events
    EDIT: 0xFFA500,     // ✅ Orange for editing/updating events
    WARNING: 0xFFFF00,  // ✅ Yellow for warnings or alerts
    DEFAULT: 0xFFFFFF   // ✅ White as the fallback color
});

export default COLOUR_VALUES;