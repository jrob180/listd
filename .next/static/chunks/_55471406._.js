(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/components/PillButton.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>PillButton
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/motion/proxy.mjs [app-client] (ecmascript)");
"use client";
;
;
/* Speech bubble icon (Bootstrap Icons chat-fill, MIT). Transparent background, white fill. */ const SpeechBubbleIcon = ()=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        width: "20",
        height: "20",
        viewBox: "0 0 16 16",
        fill: "white",
        className: "shrink-0",
        "aria-hidden": true,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
            d: "M8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.273.362 2.256-.37 3.597-.938 4.18-1.234A9 9 0 0 0 8 15"
        }, void 0, false, {
            fileName: "[project]/components/PillButton.tsx",
            lineNumber: 27,
            columnNumber: 5
        }, ("TURBOPACK compile-time value", void 0))
    }, void 0, false, {
        fileName: "[project]/components/PillButton.tsx",
        lineNumber: 18,
        columnNumber: 3
    }, ("TURBOPACK compile-time value", void 0));
_c = SpeechBubbleIcon;
function PillButton(param) {
    let { children = "list something", href = "#", className = "", as = "a", type = "button", target, rel, onClick } = param;
    const baseClass = "inline-flex items-center gap-3 rounded-[1.25rem] bg-[#efefef] px-5 py-3 text-[0.8125rem] font-medium leading-[1.35] text-[#111] border border-[rgba(0,0,0,0.06)] transition-opacity hover:opacity-90 active:opacity-95";
    const content = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.25)]",
                style: {
                    background: "linear-gradient(145deg, #4ade80 0%, #34C759 50%, #2dba4e 100%)"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SpeechBubbleIcon, {}, void 0, false, {
                    fileName: "[project]/components/PillButton.tsx",
                    lineNumber: 54,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/PillButton.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                children: children
            }, void 0, false, {
                fileName: "[project]/components/PillButton.tsx",
                lineNumber: 56,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
    if (as === "a") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].a, {
            href: href,
            className: "".concat(baseClass, " ").concat(className),
            whileHover: {
                scale: 1.02
            },
            whileTap: {
                scale: 0.98
            },
            target: target,
            rel: rel,
            onClick: onClick,
            children: content
        }, void 0, false, {
            fileName: "[project]/components/PillButton.tsx",
            lineNumber: 62,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].button, {
        type: type,
        className: "".concat(baseClass, " ").concat(className),
        whileHover: {
            scale: 1.02
        },
        whileTap: {
            scale: 0.98
        },
        onClick: onClick,
        children: content
    }, void 0, false, {
        fileName: "[project]/components/PillButton.tsx",
        lineNumber: 77,
        columnNumber: 5
    }, this);
}
_c1 = PillButton;
var _c, _c1;
__turbopack_context__.k.register(_c, "SpeechBubbleIcon");
__turbopack_context__.k.register(_c1, "PillButton");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/app/(platform)/list/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ListPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$PillButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/PillButton.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const PREFILL_BODY = "i want to sell something";
/** E.164 (e.g. +447476971486) to wa.me number (447476971486) */ function toWhatsAppNumber(e164) {
    return e164.replace(/\D/g, "");
}
function getWhatsAppHref(phoneNumber) {
    const num = toWhatsAppNumber(phoneNumber);
    const text = encodeURIComponent(PREFILL_BODY);
    return "https://wa.me/".concat(num, "?text=").concat(text);
}
const PLACEHOLDER_NUMBER = "+15551234567";
function ListPage() {
    var _process_env_NEXT_PUBLIC_LISTD_PHONE_NUMBER;
    _s();
    const [copied, setCopied] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const envNumber = (_process_env_NEXT_PUBLIC_LISTD_PHONE_NUMBER = ("TURBOPACK compile-time value", "+14155238886")) === null || _process_env_NEXT_PUBLIC_LISTD_PHONE_NUMBER === void 0 ? void 0 : _process_env_NEXT_PUBLIC_LISTD_PHONE_NUMBER.trim();
    const phoneNumber = envNumber && envNumber !== "" ? envNumber : null;
    const isConfigured = phoneNumber != null && phoneNumber !== PLACEHOLDER_NUMBER;
    const whatsAppHref = phoneNumber ? getWhatsAppHref(phoneNumber) : "#";
    const handleClick = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ListPage.useCallback[handleClick]": ()=>{
            navigator.clipboard.writeText(PREFILL_BODY).then({
                "ListPage.useCallback[handleClick]": ()=>{
                    setCopied(true);
                    setTimeout({
                        "ListPage.useCallback[handleClick]": ()=>setCopied(false)
                    }["ListPage.useCallback[handleClick]"], 2000);
                }
            }["ListPage.useCallback[handleClick]"]);
        }
    }["ListPage.useCallback[handleClick]"], []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "flex min-h-screen flex-col items-center justify-center px-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                className: "text-2xl font-semibold text-[var(--fg)]",
                children: "List something"
            }, void 0, false, {
                fileName: "[project]/app/(platform)/list/page.tsx",
                lineNumber: 37,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "mt-2 text-center text-[var(--fg-muted)]",
                children: "We'll guide you over WhatsApp. Tap below to open WhatsApp and send the first message."
            }, void 0, false, {
                fileName: "[project]/app/(platform)/list/page.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-8",
                children: isConfigured ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$PillButton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                    as: "a",
                    href: whatsAppHref,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    children: "List something"
                }, void 0, false, {
                    fileName: "[project]/app/(platform)/list/page.tsx",
                    lineNumber: 46,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded-lg border border-amber-500/50 bg-amber-500/10 px-5 py-4 text-center text-sm text-[var(--fg-muted)]",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "font-medium text-[var(--fg)]",
                            children: "WhatsApp number not configured"
                        }, void 0, false, {
                            fileName: "[project]/app/(platform)/list/page.tsx",
                            lineNumber: 56,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-1",
                            children: [
                                "Set ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                    className: "rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-xs",
                                    children: "NEXT_PUBLIC_LISTD_PHONE_NUMBER"
                                }, void 0, false, {
                                    fileName: "[project]/app/(platform)/list/page.tsx",
                                    lineNumber: 60,
                                    columnNumber: 19
                                }, this),
                                " in",
                                " ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                    className: "rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-xs",
                                    children: ".env.local"
                                }, void 0, false, {
                                    fileName: "[project]/app/(platform)/list/page.tsx",
                                    lineNumber: 61,
                                    columnNumber: 15
                                }, this),
                                " to your Twilio WhatsApp number (e.g. sandbox ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                    className: "rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-xs",
                                    children: "+14155238886"
                                }, void 0, false, {
                                    fileName: "[project]/app/(platform)/list/page.tsx",
                                    lineNumber: 61,
                                    columnNumber: 147
                                }, this),
                                "), then restart the dev server."
                            ]
                        }, void 0, true, {
                            fileName: "[project]/app/(platform)/list/page.tsx",
                            lineNumber: 59,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/app/(platform)/list/page.tsx",
                    lineNumber: 55,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/app/(platform)/list/page.tsx",
                lineNumber: 44,
                columnNumber: 7
            }, this),
            isConfigured && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-6 max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center text-sm text-[var(--fg-muted)]",
                children: [
                    copied ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: [
                            'Copied "',
                            PREFILL_BODY,
                            '" to clipboard.'
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/(platform)/list/page.tsx",
                        lineNumber: 69,
                        columnNumber: 13
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: [
                            "Or copy the message and open",
                            " ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                href: whatsAppHref,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                className: "font-medium text-[var(--fg)] underline",
                                children: "WhatsApp"
                            }, void 0, false, {
                                fileName: "[project]/app/(platform)/list/page.tsx",
                                lineNumber: 73,
                                columnNumber: 15
                            }, this),
                            " ",
                            "to chat with ",
                            phoneNumber,
                            "."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/(platform)/list/page.tsx",
                        lineNumber: 71,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: handleClick,
                        className: "mt-2 text-xs underline hover:no-underline",
                        children: "Copy message"
                    }, void 0, false, {
                        fileName: "[project]/app/(platform)/list/page.tsx",
                        lineNumber: 84,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/(platform)/list/page.tsx",
                lineNumber: 67,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/(platform)/list/page.tsx",
        lineNumber: 36,
        columnNumber: 5
    }, this);
}
_s(ListPage, "b8Mx5uLgKDHXqLxK13yC8XrTNuQ=");
_c = ListPage;
var _c;
__turbopack_context__.k.register(_c, "ListPage");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_55471406._.js.map