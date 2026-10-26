// ADR 0141, bipe-chat/bipe#532: the power levels of a new DM, from registries/dm-power-levels.json.
// The content is JSON with sorted keys; only the two user ids are filled in at run time.

// Matrix event content keys, in sorted order. "users" is filled in by the app.
function contentParts(pl) {
  const fixed = {
    ban: pl.ban,
    events: Object.fromEntries(Object.entries(pl.events).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    events_default: pl.eventsDefault,
    invite: pl.invite,
    kick: pl.kick,
    notifications: pl.notifications,
    redact: pl.redact,
    state_default: pl.stateDefault,
  };
  const prefix = JSON.stringify(fixed).slice(0, -1) + ',"users":{';
  const suffix = `},"users_default":${pl.usersDefault}}`;
  return { prefix, suffix };
}

// The reference: the content for these user ids, both at usersDefault.
export function dmPowerLevelsContent(pl, userIds) {
  const { prefix, suffix } = contentParts(pl);
  const users = [...new Set(userIds)].sort().map((id) => `${JSON.stringify(id)}:${pl.usersDefault}`).join(",");
  return prefix + users + suffix;
}

export function generateDmPowerLevels(pl, language, header, quote) {
  const { prefix, suffix } = contentParts(pl);
  if (language === "swift") return `${header}
/// The power levels of a new DM (ADR 0141): neither person can invite or change the room.
public enum BipeDmPowerLevels {
    /// The user's level in Client.createRoom, so that the server can write the first state and the invite.
    public static let createLevel: Int64 = ${pl.createLevel}
    /// Both people after the DM is created.
    public static let usersDefault: Int64 = ${pl.usersDefault}

    /// The m.room.power_levels content, sent with Room.sendStateEventRaw right after Client.createRoom.
    public static func content(userIds: [String]) -> String {
        let users = Set(userIds).sorted().map { "\\(jsonString($0)):\\(usersDefault)" }.joined(separator: ",")
        return ${quote(prefix)} + users + ${quote(suffix)}
    }

    private static func jsonString(_ value: String) -> String {
        var out = "\\""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "\\"": out += "\\\\\\""
            case "\\\\": out += "\\\\\\\\"
            default:
                if scalar.value < 0x20 {
                    let hex = String(scalar.value, radix: 16)
                    out += "\\\\u" + String(repeating: "0", count: 4 - hex.count) + hex
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\\""
    }
}
`;
  if (language !== "kotlin") throw new Error(`unsupported DM power levels language: ${language}`);
  return `${header}
package chat.bipe.shared.generated

/** The power levels of a new DM (ADR 0141): neither person can invite or change the room. */
object BipeDmPowerLevels {
    /** The user's level in Client.createRoom, so that the server can write the first state and the invite. */
    const val CREATE_LEVEL: Long = ${pl.createLevel}L
    /** Both people after the DM is created. */
    const val USERS_DEFAULT: Long = ${pl.usersDefault}L

    /** The m.room.power_levels content, sent with Room.sendStateEventRaw right after Client.createRoom. */
    fun content(userIds: List<String>): String {
        val users = userIds.toSortedSet().joinToString(",") { "\${jsonString(it)}:$USERS_DEFAULT" }
        return ${quote(prefix)} + users + ${quote(suffix)}
    }

    private fun jsonString(value: String): String = buildString {
        append('"')
        for (c in value) {
            when {
                c == '"' -> append("\\\\\\"")
                c == '\\\\' -> append("\\\\\\\\")
                c.code < 0x20 -> append("\\\\u%04x".format(c.code))
                else -> append(c)
            }
        }
        append('"')
    }
}
`;
}
