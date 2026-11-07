// SPDX-License-Identifier: AGPL-3.0-only
// Additional permission: APP-STORE-PERMISSION.md (AGPL section 7)
// Copyright 2026 Bipe contributors

// Context menus (registries/context-menus.json): validation and Swift/Kotlin output.

export function validateContextMenus(reg) {
  const menus = reg.contextMenus;
  if (menus?.version !== 1) throw new Error("context-menus: version must be 1");
  for (const name of ["message", "chatRow"]) {
    const ids = new Set();
    for (const item of menus[name] ?? []) {
      if (!/^[a-z][A-Za-z]*$/.test(item.id) || ids.has(item.id)) throw new Error(`context-menus: ${name}: id "${item.id}"`);
      ids.add(item.id);
      if (!(item.title in reg.strings.strings) || !(item.title in reg.stringsEn.strings)) throw new Error(`context-menus: ${name}.${item.id}: string "${item.title}"`);
      if (typeof item.symbol !== "string" || !item.symbol) throw new Error(`context-menus: ${name}.${item.id}: symbol`);
    }
    if (!ids.size) throw new Error(`context-menus: ${name}: no commands`);
  }
}

function swiftEnum(name, items, quote) {
  const cases = (value) => items.map((i) => `        case .${i.id}: ${value(i)}`).join("\n");
  return `
public enum ${name}: String, CaseIterable, Sendable {
${items.map((i) => `    case ${i.id}`).join("\n")}

    public var title: String {
        switch self {
${cases((i) => `NSLocalizedString(${quote(i.title)}, tableName: "Bipe", bundle: .module, comment: "")`)}
        }
    }

    public var symbol: String {
        switch self {
${cases((i) => quote(i.symbol))}
        }
    }

    public var isDestructive: Bool { ${items.some((i) => i.destructive) ? `[${items.filter((i) => i.destructive).map((i) => `.${i.id}`).join(", ")}].contains(self)` : "false"} }
}
`;
}

export function generateContextMenus(menus, language, header, quote) {
  if (language === "swift") {
    return header + `
import Foundation
${swiftEnum("BipeMessageMenuItem", menus.message, quote)}${swiftEnum("BipeChatMenuItem", menus.chatRow, quote)}`;
  }
  return header + `
package chat.bipe.shared.generated

/** Context menu order (registries/context-menus.json). */
object BipeContextMenus {
    val message: List<String> = listOf(${menus.message.map((i) => quote(i.id)).join(", ")})
    val chatRow: List<String> = listOf(${menus.chatRow.map((i) => quote(i.id)).join(", ")})
}
`;
}
