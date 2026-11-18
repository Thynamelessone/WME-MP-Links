// ==UserScript==
// @name         WME MP Links
// @namespace    https://github.com/
// @version      1.0.2
// @description  Creates clickable links for any web URLs found on MPs.
// @author       Thynamelessone
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @exclude      https://www.waze.com/*user/*editor/*
// @grant        none
// @require      https://cdn.jsdelivr.net/gh/TheEditorX/wme-sdk-plus@72968ef0792a3bd673f768f8ee2a10d67653d1ea/wme-sdk-plus.js
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @downloadURL  https://github.com/Thynamelessone/WME-MP-Links/raw/refs/heads/main/WME-MP-Links.user.js
// @updateURL    https://github.com/Thynamelessone/WME-MP-Links/raw/refs/heads/main/WME-MP-Links.user.js
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_ID = "WME-MP-Links";
    const SCRIPT_NAME = "WME MP Links";
    const updateMessage = "Fixed bug where script failed to load following refresh";

    const URL_REGEX_TEST = /(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<"'`;,]*)?/i;
    const URL_REGEX_MATCH = /(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<"'`;,]*)?/gi;
    const TAB_TARGET_NAME = 'wme_shared_external_tab';

    let sharedWindowRef = null;
    let scanTimeout = null;
    const observedRoots = new WeakSet();

    function openInSharedTab(url) {
        const targetUrl = url.startsWith('www.') ? `https://${url}` : url;
        if (!sharedWindowRef || sharedWindowRef.closed) {
            sharedWindowRef = window.open(targetUrl, TAB_TARGET_NAME);
        } else {
            sharedWindowRef.location.href = targetUrl;
            sharedWindowRef.focus();
        }
    }

    function linkifyNode(node) {
        if (
            node.nodeType !== Node.TEXT_NODE ||
            !node.nodeValue ||
            !URL_REGEX_TEST.test(node.nodeValue)
        ) {
            return;
        }

        const parent = node.parentNode;
        if (!parent || ['A', 'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].includes(parent.tagName)) {
            return;
        }

        const text = node.nodeValue;
        const fragment = document.createDocumentFragment();
        let lastIdx = 0;

        text.replace(URL_REGEX_MATCH, (match, offset) => {
            if (offset > lastIdx) {
                fragment.appendChild(document.createTextNode(text.slice(lastIdx, offset)));
            }

            const anchor = document.createElement('a');
            anchor.href = match.startsWith('www.') ? `https://${match}` : match;
            anchor.innerText = match;
            anchor.style.color = '#33a3dc';
            anchor.style.textDecoration = 'underline';
            anchor.style.fontWeight = 'bold';
            anchor.style.cursor = 'pointer';

            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openInSharedTab(match);
            });

            fragment.appendChild(anchor);
            lastIdx = offset + match.length;
        });

        if (lastIdx < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
        }

        parent.replaceChild(fragment, node);
    }

    // Recursively scans standard DOM and Shadow DOM roots
    function walkAndLinkify(root) {
        if (!root) return;
        observeRoot(root);

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            null,
            false
        );

        const textNodes = [];
        let currentNode;
        while ((currentNode = walker.nextNode())) {
            if (currentNode.nodeType === Node.TEXT_NODE) {
                textNodes.push(currentNode);
            } else if (currentNode.shadowRoot) {
                walkAndLinkify(currentNode.shadowRoot);
            }
        }

        textNodes.forEach(linkifyNode);
    }

    function scanForLinks() {
        const selectors = [
            '#sidebarContent',
            '.problem-detail',
            '.map-problem-detail',
            '.modal-content',
            '.edit-panel',
            '.closure-detail',
            'div[class*="problem"]',
            'div[class*="panel"]'
        ];

        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(walkAndLinkify);
        });
    }

    function scheduleScan() {
        if (scanTimeout) clearTimeout(scanTimeout);
        scanTimeout = setTimeout(scanForLinks, 150);
    }

    function observeRoot(root) {
        if (observedRoots.has(root)) return;
        observedRoots.add(root);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0 || mutation.type === 'characterData') {
                    scheduleScan();
                    break;
                }
            }
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    async function initialise() {
        try {
            console.log(`[${SCRIPT_NAME}] Initialising...`);

            if (typeof getWmeSdk !== "function") {
                throw new Error("WME SDK is unavailable.");
            }

            const wmeSdk = getWmeSdk({ scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });

            // Fix: Only wait for wme-ready if WME isn't already ready
            if (!wmeSdk.State.isReady()) {
                await wmeSdk.Events.once({ eventName: "wme-ready" });
            }

            if (typeof WazeWrap !== 'undefined' && WazeWrap.Interface) {
                WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, GM_info.script.version, updateMessage);
            }

            const targetNode = document.getElementById('app-container') || document.body;
            observeRoot(targetNode);
            scanForLinks();

            console.log(`[${SCRIPT_NAME}] Initialisation complete.`);
        } catch (error) {
            console.error(`[${SCRIPT_NAME}] Initialisation failed.`, error);
        }
    }

    if (window.SDK_INITIALIZED && typeof window.SDK_INITIALIZED.then === "function") {
        window.SDK_INITIALIZED.then(initialise);
    } else {
        console.error(`[${SCRIPT_NAME}] SDK_INITIALIZED is unavailable.`);
    }
})();