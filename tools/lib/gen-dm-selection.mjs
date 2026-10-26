// ADR 0141. The registry fixes eligibility/order; SDK adapters supply local candidates.
export function generateDmSelection(registry, language, header) {
  if (registry.order !== "latest-event-descending" || registry.tieBreak !== "room-id-ascending") throw new Error("unsupported DM selection policy");
  if (language === "swift") return `${header}
/// Local room facts for ADR 0141. Eligibility excludes left, invited and non-DM rooms. Clear markers stay separate.
public struct BipeDmCandidate: Equatable, Sendable {
    public let roomId: String
    public let peerUserId: String
    public let latestActivityMs: Int64?
    public let eligible: Bool
    public let cleared: Bool

    public init(roomId: String, peerUserId: String, latestActivityMs: Int64?, eligible: Bool, cleared: Bool = false) {
        self.roomId = roomId
        self.peerUserId = peerUserId
        self.latestActivityMs = latestActivityMs
        self.eligible = eligible
        self.cleared = cleared
    }
}

/// Same selected room in lists, unread/search results and Start chat. No network or room mutation.
public enum BipeDmSelection {
    public static func newestRooms(_ candidates: [BipeDmCandidate], includingCleared: Bool = false) -> [String: String] {
        var chosen: [String: BipeDmCandidate] = [:]
        for candidate in candidates where candidate.eligible && (includingCleared || !candidate.cleared) && !candidate.roomId.isEmpty && !candidate.peerUserId.isEmpty {
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
package chat.bipe.shared.generated

/** Local room facts for ADR 0141. Eligibility excludes left, invited and non-DM rooms. Clear markers stay separate. */
data class BipeDmCandidate(val roomId: String, val peerUserId: String, val latestActivityMs: Long?, val eligible: Boolean, val cleared: Boolean = false)

/** Same selected room in lists, unread/search results and Start chat. No network or room mutation. */
object BipeDmSelection {
    fun newestRooms(candidates: List<BipeDmCandidate>, includingCleared: Boolean = false): Map<String, String> {
        val chosen = mutableMapOf<String, BipeDmCandidate>()
        for (candidate in candidates) {
            if (!candidate.eligible || (!includingCleared && candidate.cleared) || candidate.roomId.isEmpty() || candidate.peerUserId.isEmpty()) continue
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
