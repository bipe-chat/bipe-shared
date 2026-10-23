// ADR 0141. The registry fixes eligibility/order; SDK adapters supply local candidates.
export function generateDmSelection(registry, language, header) {
  if (registry.order !== "latest-event-descending" || registry.tieBreak !== "room-id-ascending") throw new Error("unsupported DM selection policy");
  if (language === "swift") return `${header}
/// Local room facts for ADR 0141. Eligibility excludes left, invited, cleared and non-DM rooms.
public struct BipeDmCandidate: Equatable, Sendable {
    public let roomId: String
    public let peerUserId: String
    public let latestActivityMs: Int64?
    public let eligible: Bool

    public init(roomId: String, peerUserId: String, latestActivityMs: Int64?, eligible: Bool) {
        self.roomId = roomId
        self.peerUserId = peerUserId
        self.latestActivityMs = latestActivityMs
        self.eligible = eligible
    }
}

/// Same selected room in lists, unread/search results and Start chat. No network or room mutation.
public enum BipeDmSelection {
    public static func newestRooms(_ candidates: [BipeDmCandidate]) -> [String: String] {
        var chosen: [String: BipeDmCandidate] = [:]
        for candidate in candidates where candidate.eligible && !candidate.roomId.isEmpty && !candidate.peerUserId.isEmpty {
            if let previous = chosen[candidate.peerUserId] {
                let oldTime = previous.latestActivityMs ?? Int64.min
                let newTime = candidate.latestActivityMs ?? Int64.min
                if newTime < oldTime || (newTime == oldTime && candidate.roomId >= previous.roomId) { continue }
            }
            chosen[candidate.peerUserId] = candidate
        }
        return chosen.mapValues(\\.roomId)
    }
}
`;
  if (language !== "kotlin") throw new Error(`unsupported DM selection language: ${language}`);
  return `${header}
package io.element.android.libraries.bipe.generated

/** Local room facts for ADR 0141. Eligibility excludes left, invited, cleared and non-DM rooms. */
data class BipeDmCandidate(val roomId: String, val peerUserId: String, val latestActivityMs: Long?, val eligible: Boolean)

/** Same selected room in lists, unread/search results and Start chat. No network or room mutation. */
object BipeDmSelection {
    fun newestRooms(candidates: List<BipeDmCandidate>): Map<String, String> {
        val chosen = mutableMapOf<String, BipeDmCandidate>()
        for (candidate in candidates) {
            if (!candidate.eligible || candidate.roomId.isEmpty() || candidate.peerUserId.isEmpty()) continue
            val previous = chosen[candidate.peerUserId]
            if (previous != null) {
                val oldTime = previous.latestActivityMs ?: Long.MIN_VALUE
                val newTime = candidate.latestActivityMs ?: Long.MIN_VALUE
                if (newTime < oldTime || (newTime == oldTime && candidate.roomId >= previous.roomId)) continue
            }
            chosen[candidate.peerUserId] = candidate
        }
        return chosen.mapValues { it.value.roomId }
    }
}
`;
}
