// bipe-chat/bipe#733: the roles and the power levels of a new group, from registries/group-power-levels.json.

const sorted = (events) => Object.entries(events).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

export function generateGroupPowerLevels(pl, language, header, quote) {
  const { admin, moderator, member } = pl.roles;
  if (language === "swift") {
    const events = sorted(pl.events).map(([type, v]) => `        ${quote(type)}: ${v},`).join("\n");
    return `${header}
/// The roles of a group (bipe-chat/bipe#733) and the m.room.power_levels of a new group.
public enum BipeGroupPowerLevels {
    /// Changes roles and group settings, notifies everyone with @room.
    public static let admin: Int64 = ${admin}
    /// Removes and bans members, deletes other people's messages, pins messages.
    public static let moderator: Int64 = ${moderator}
    /// Posts, reacts and replies.
    public static let member: Int64 = ${member}

    public static let usersDefault: Int64 = ${pl.usersDefault}
    public static let eventsDefault: Int64 = ${pl.eventsDefault}
    public static let stateDefault: Int64 = ${pl.stateDefault}
    public static let invite: Int64 = ${pl.invite}
    public static let kick: Int64 = ${pl.kick}
    public static let ban: Int64 = ${pl.ban}
    public static let redact: Int64 = ${pl.redact}
    public static let notificationsRoom: Int64 = ${pl.notifications.room}
    /// The room state event of a publication-only group (bipe ADR 0280): content enabled exactly true turns it on.
    public static let publicationOnlyEvent = ${quote(pl.publicationOnly.stateEvent)}
    /// Below this level a member of a publication-only group sends only thread replies, edits, reactions and redactions.
    public static let publicationOnlyMinPostLevel: Int64 = ${pl.publicationOnly.minPostLevel}
    public static let events: [String: Int64] = [
${events}
    ]
}
`;
  }
  if (language !== "kotlin") throw new Error(`unsupported group power levels language: ${language}`);
  const events = sorted(pl.events).map(([type, v]) => `        ${quote(type)} to ${v}L,`).join("\n");
  return `${header}
package chat.bipe.shared.generated

/** The roles of a group (bipe-chat/bipe#733) and the m.room.power_levels of a new group. */
object BipeGroupPowerLevels {
    /** Changes roles and group settings, notifies everyone with @room. */
    const val ADMIN: Long = ${admin}L
    /** Removes and bans members, deletes other people's messages, pins messages. */
    const val MODERATOR: Long = ${moderator}L
    /** Posts, reacts and replies. */
    const val MEMBER: Long = ${member}L

    const val USERS_DEFAULT: Long = ${pl.usersDefault}L
    const val EVENTS_DEFAULT: Long = ${pl.eventsDefault}L
    const val STATE_DEFAULT: Long = ${pl.stateDefault}L
    const val INVITE: Long = ${pl.invite}L
    const val KICK: Long = ${pl.kick}L
    const val BAN: Long = ${pl.ban}L
    const val REDACT: Long = ${pl.redact}L
    const val NOTIFICATIONS_ROOM: Long = ${pl.notifications.room}L
    /** The room state event of a publication-only group (bipe ADR 0280): content enabled exactly true turns it on. */
    const val PUBLICATION_ONLY_EVENT: String = ${quote(pl.publicationOnly.stateEvent)}
    /** Below this level a member of a publication-only group sends only thread replies, edits, reactions and redactions. */
    const val PUBLICATION_ONLY_MIN_POST_LEVEL: Long = ${pl.publicationOnly.minPostLevel}L
    val EVENTS: Map<String, Long> = mapOf(
${events}
    )
}
`;
}
