// Mural home score (ADR 0246, bipe-chat/bipe#1044): Swift and Kotlin output. The formula is in registries/home-score.json,
// the reference is home-score.mjs, and test-vectors/home-score.json checks all of them.
import { homeUnits } from "./home-score.mjs";

const dbl = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
const percent = (x) => Math.floor(x * 100 + 0.5);

export function generateHomeScore(policy, language, header, quote) {
  const w = policy.weights;
  const attention = Object.entries(policy.model.attention);
  return language === "swift" ? `${header}
import Foundation

public nonisolated enum BipeHomeChatKind: String, Sendable {
    case person, company, group
}

public nonisolated enum BipeHomeReason: String, Sendable {
    case mention, unanswered
}

/// The explicit inputs of one chat. Pass joined, not archived chats only. Step 1 of ADR 0246 passes no model fields.
public nonisolated struct BipeHomeChat: Equatable, Sendable {
    public var id: String
    public var kind: BipeHomeChatKind
    public var hasSeal: Bool
    public var official: Bool
    public var favourite: Bool
    public var muted: Bool
    public var mentioned: Bool
    public var unreadCount: Int
    public var lastFromOther: Bool
    /// nil: the time of the latest event is unknown.
    public var minutesSinceActivity: Int?
    public var messagesPerWeek: Int
    public var trustWarning: Bool
    public var modelAttention: String?
    public var modelDue: Bool

    public init(
        id: String,
        kind: BipeHomeChatKind,
        hasSeal: Bool = false,
        official: Bool = false,
        favourite: Bool = false,
        muted: Bool = false,
        mentioned: Bool = false,
        unreadCount: Int = 0,
        lastFromOther: Bool = false,
        minutesSinceActivity: Int? = nil,
        messagesPerWeek: Int = 0,
        trustWarning: Bool = false,
        modelAttention: String? = nil,
        modelDue: Bool = false
    ) {
        self.id = id
        self.kind = kind
        self.hasSeal = hasSeal
        self.official = official
        self.favourite = favourite
        self.muted = muted
        self.mentioned = mentioned
        self.unreadCount = unreadCount
        self.lastFromOther = lastFromOther
        self.minutesSinceActivity = minutesSinceActivity
        self.messagesPerWeek = messagesPerWeek
        self.trustWarning = trustWarning
        self.modelAttention = modelAttention
        self.modelDue = modelDue
    }
}

public nonisolated struct BipeHomeScored: Equatable, Sendable {
    public let scorePercent: Int
    public let reason: BipeHomeReason?
    public var score: Double { Double(scorePercent) / 100.0 }
}

public nonisolated struct BipeHomeTile: Equatable, Sendable {
    public let id: String
    public let scorePercent: Int
    /// nil: no tile. The chat is only in the plain list.
    public let tier: Int?
    public let reason: BipeHomeReason?
    public var score: Double { Double(scorePercent) / 100.0 }
}

public nonisolated struct BipeHomeTierRule: Equatable, Sendable {
    public let tier: Int
    public let minPercent: Int
    /// nil: no limit.
    public let maxChats: Int?
    /// nil: avatars only, in rows that wrap.
    public let columns: Int?
}

/// Source: bipe-shared/registries/home-score.json, which holds the formula.
public nonisolated enum BipeHomeScore {
    public static let tiers: [BipeHomeTierRule] = [
${policy.tiers.map((t) => `        BipeHomeTierRule(tier: ${t.tier}, minPercent: ${percent(t.minScore)}, maxChats: ${t.maxChats ?? "nil"}, columns: ${t.columns ?? "nil"}),`).join("\n")}
    ]
    public static let messagesPerWeekWindowDays = ${policy.tie.windowDays}
    public static let firstTileMessages = ${policy.tile.firstTileMessages}
    public static let secondTileMessages = ${policy.tile.secondTileMessages}
    public static let tier2Bubbles = ${policy.tile.tier2Bubbles}
    public static let tier3TextLines = ${policy.tile.tier3TextLines}
    public static let gistMaxLength = ${policy.model.gistMaxLength}
    public static let dueMaxLength = ${policy.model.dueMaxLength}
    public static let draftMaxLength = ${policy.model.draftMaxLength}

    private static let modelAttentionUnits: [String: Int] = [${attention.map(([k, v]) => `${quote(k)}: ${homeUnits(v)}`).join(", ")}]

    private static func units(_ value: Double) -> Int { Int(floor(value * 10000.0 + 0.5)) }

    private static func modelUnits(_ chat: BipeHomeChat, unread: Int) -> Int {
        if (chat.kind == .company && !chat.hasSeal) || chat.official || chat.trustWarning { return 0 }
        var sum = 0
        if let attention = chat.modelAttention, let weight = modelAttentionUnits[attention], attention != "none" || unread > 0 {
            sum += weight
        }
        if chat.modelDue { sum += ${homeUnits(policy.model.due)} }
        return min(sum, ${homeUnits(policy.model.maxWeight)})
    }

    public static func score(_ chat: BipeHomeChat) -> BipeHomeScored {
        let unread = max(chat.unreadCount, 0)
        let minutes = chat.minutesSinceActivity.map { max($0, 0) }
        let direct = chat.kind != .group
        var sum = 0
        if chat.mentioned { sum += ${homeUnits(w.mention)} }
        if unread > 0 {
            if direct {
                sum += (chat.kind == .company && !chat.hasSeal) ? ${homeUnits(w.unreadCompanyNoSeal)} : ${homeUnits(w.unreadDirect)}
            } else {
                sum += min(${homeUnits(policy.unreadGroup.max)}, units(${dbl(policy.unreadGroup.min)} + ${dbl(policy.unreadGroup.logScale)} * log10(1.0 + Double(unread))))
            }
        }
        var unanswered = false
        if direct, unread == 0, chat.lastFromOther, let minutes, minutes < ${policy.unansweredMaxMinutes} {
            unanswered = true
            sum += ${homeUnits(w.unansweredDirect)}
        }
        if chat.favourite { sum += ${homeUnits(w.favourite)} }
        sum += min(${homeUnits(policy.tie.max)}, units(${dbl(policy.tie.logScale)} * log2(1.0 + Double(max(chat.messagesPerWeek, 0)))))
        if let minutes { sum += units(${dbl(policy.recency.max)} * exp(-Double(minutes) / ${dbl(policy.recency.decayMinutes)})) }
        sum += modelUnits(chat, unread: unread)
        if chat.muted && !chat.mentioned { sum = Int(floor(Double(sum) * ${dbl(policy.mutedFactor)} + 0.5)) }
        if chat.official { sum = min(sum, ${homeUnits(policy.officialCap)}) }
        sum = min(max(sum, 0), 10000)
        return BipeHomeScored(scorePercent: (sum + 50) / 100, reason: chat.mentioned ? .mention : (unanswered ? .unanswered : nil))
    }

    /// The tiles in screen order.
    public static func plan(_ chats: [BipeHomeChat]) -> [BipeHomeTile] {
        let scored = chats.map { (chat: $0, result: score($0)) }
        let ordered = scored.sorted { a, b in
            if a.result.scorePercent != b.result.scorePercent { return a.result.scorePercent > b.result.scorePercent }
            let am = a.chat.minutesSinceActivity.map { max($0, 0) } ?? Int.max
            let bm = b.chat.minutesSinceActivity.map { max($0, 0) } ?? Int.max
            if am != bm { return am < bm }
            return a.chat.id < b.chat.id
        }
        var counts: [Int: Int] = [:]
        var tiles: [BipeHomeTile] = []
        tiles.reserveCapacity(ordered.count)
        for item in ordered {
            let rule = tiers.first { candidate in
                guard item.result.scorePercent >= candidate.minPercent else { return false }
                guard let limit = candidate.maxChats else { return true }
                return counts[candidate.tier, default: 0] < limit
            }
            if let rule { counts[rule.tier, default: 0] += 1 }
            tiles.append(BipeHomeTile(id: item.chat.id, scorePercent: item.result.scorePercent, tier: rule?.tier, reason: item.result.reason))
        }
        return tiles
    }
}
` : language === "kotlin" ? `${header}
package chat.bipe.shared.generated

import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.log2

enum class BipeHomeChatKind { PERSON, COMPANY, GROUP }

enum class BipeHomeReason { MENTION, UNANSWERED }

/** The explicit inputs of one chat. Pass joined, not archived chats only. Step 1 of ADR 0246 passes no model fields. */
data class BipeHomeChat(
    val id: String,
    val kind: BipeHomeChatKind,
    val hasSeal: Boolean = false,
    val official: Boolean = false,
    val favourite: Boolean = false,
    val muted: Boolean = false,
    val mentioned: Boolean = false,
    val unreadCount: Int = 0,
    val lastFromOther: Boolean = false,
    /** null: the time of the latest event is unknown. */
    val minutesSinceActivity: Int? = null,
    val messagesPerWeek: Int = 0,
    val trustWarning: Boolean = false,
    val modelAttention: String? = null,
    val modelDue: Boolean = false,
)

data class BipeHomeScored(val scorePercent: Int, val reason: BipeHomeReason?) {
    val score: Double get() = scorePercent / 100.0
}

/** tier null: no tile. The chat is only in the plain list. */
data class BipeHomeTile(val id: String, val scorePercent: Int, val tier: Int?, val reason: BipeHomeReason?) {
    val score: Double get() = scorePercent / 100.0
}

/** maxChats null: no limit. columns null: avatars only, in rows that wrap. */
data class BipeHomeTierRule(val tier: Int, val minPercent: Int, val maxChats: Int?, val columns: Int?)

/** Source: bipe-shared/registries/home-score.json, which holds the formula. */
object BipeHomeScore {
    val tiers: List<BipeHomeTierRule> = listOf(
${policy.tiers.map((t) => `        BipeHomeTierRule(${t.tier}, ${percent(t.minScore)}, ${t.maxChats ?? "null"}, ${t.columns ?? "null"}),`).join("\n")}
    )
    const val MESSAGES_PER_WEEK_WINDOW_DAYS = ${policy.tie.windowDays}
    const val FIRST_TILE_MESSAGES = ${policy.tile.firstTileMessages}
    const val SECOND_TILE_MESSAGES = ${policy.tile.secondTileMessages}
    const val TIER2_BUBBLES = ${policy.tile.tier2Bubbles}
    const val TIER3_TEXT_LINES = ${policy.tile.tier3TextLines}
    const val GIST_MAX_LENGTH = ${policy.model.gistMaxLength}
    const val DUE_MAX_LENGTH = ${policy.model.dueMaxLength}
    const val DRAFT_MAX_LENGTH = ${policy.model.draftMaxLength}

    private val modelAttentionUnits: Map<String, Int> = mapOf(${attention.map(([k, v]) => `${quote(k)} to ${homeUnits(v)}`).join(", ")})

    private fun units(value: Double): Int = floor(value * 10000.0 + 0.5).toInt()

    private fun modelUnits(chat: BipeHomeChat, unread: Int): Int {
        if ((chat.kind == BipeHomeChatKind.COMPANY && !chat.hasSeal) || chat.official || chat.trustWarning) return 0
        var sum = 0
        val attention = chat.modelAttention
        val weight = attention?.let { modelAttentionUnits[it] }
        if (weight != null && (attention != "none" || unread > 0)) sum += weight
        if (chat.modelDue) sum += ${homeUnits(policy.model.due)}
        return minOf(sum, ${homeUnits(policy.model.maxWeight)})
    }

    fun score(chat: BipeHomeChat): BipeHomeScored {
        val unread = maxOf(chat.unreadCount, 0)
        val minutes = chat.minutesSinceActivity?.let { maxOf(it, 0) }
        val direct = chat.kind != BipeHomeChatKind.GROUP
        var sum = 0
        if (chat.mentioned) sum += ${homeUnits(w.mention)}
        if (unread > 0) {
            if (direct) {
                sum += if (chat.kind == BipeHomeChatKind.COMPANY && !chat.hasSeal) ${homeUnits(w.unreadCompanyNoSeal)} else ${homeUnits(w.unreadDirect)}
            } else {
                sum += minOf(${homeUnits(policy.unreadGroup.max)}, units(${dbl(policy.unreadGroup.min)} + ${dbl(policy.unreadGroup.logScale)} * log10(1.0 + unread.toDouble())))
            }
        }
        val unanswered = direct && unread == 0 && chat.lastFromOther && minutes != null && minutes < ${policy.unansweredMaxMinutes}
        if (unanswered) sum += ${homeUnits(w.unansweredDirect)}
        if (chat.favourite) sum += ${homeUnits(w.favourite)}
        sum += minOf(${homeUnits(policy.tie.max)}, units(${dbl(policy.tie.logScale)} * log2(1.0 + maxOf(chat.messagesPerWeek, 0).toDouble())))
        if (minutes != null) sum += units(${dbl(policy.recency.max)} * exp(-minutes.toDouble() / ${dbl(policy.recency.decayMinutes)}))
        sum += modelUnits(chat, unread)
        if (chat.muted && !chat.mentioned) sum = floor(sum.toDouble() * ${dbl(policy.mutedFactor)} + 0.5).toInt()
        if (chat.official) sum = minOf(sum, ${homeUnits(policy.officialCap)})
        sum = minOf(maxOf(sum, 0), 10000)
        val reason = if (chat.mentioned) BipeHomeReason.MENTION else if (unanswered) BipeHomeReason.UNANSWERED else null
        return BipeHomeScored((sum + 50) / 100, reason)
    }

    /** The tiles in screen order. */
    fun plan(chats: List<BipeHomeChat>): List<BipeHomeTile> {
        val ordered = chats.map { it to score(it) }.sortedWith(Comparator { a, b ->
            if (a.second.scorePercent != b.second.scorePercent) return@Comparator b.second.scorePercent.compareTo(a.second.scorePercent)
            val am = a.first.minutesSinceActivity?.let { maxOf(it, 0) } ?: Int.MAX_VALUE
            val bm = b.first.minutesSinceActivity?.let { maxOf(it, 0) } ?: Int.MAX_VALUE
            if (am != bm) return@Comparator am.compareTo(bm)
            a.first.id.compareTo(b.first.id)
        })
        val counts = mutableMapOf<Int, Int>()
        return ordered.map { (chat, scored) ->
            val rule = tiers.firstOrNull { candidate ->
                scored.scorePercent >= candidate.minPercent && (candidate.maxChats == null || (counts[candidate.tier] ?: 0) < candidate.maxChats)
            }
            if (rule != null) counts[rule.tier] = (counts[rule.tier] ?: 0) + 1
            BipeHomeTile(chat.id, scored.scorePercent, rule?.tier, scored.reason)
        }
    }
}
` : null;
}
