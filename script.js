// ==UserScript==
// @name         Gemini AI Studio UI
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  解决 TrustedHTML 报错，优化 MutationObserver 性能，支持思维链精准识别。
// @author       HMuSeaB
// @match        https://aistudio.google.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. 样式注入 (性能最高且符合安全规范) ---
    function injectStyles() {
        if (document.getElementById('gemini-pretty-style')) return;
        const style = document.createElement('style');
        style.id = 'gemini-pretty-style';
        style.textContent = `
            /* 对话框基础样式 */
            ms-chat-turn {
                margin: 30px 15px !important;
                padding: 18px 18px 45px 18px !important;
                border-radius: 16px !important;
                border: 1px solid #444746 !important;
                display: block !important;
                position: relative !important;
                background: #1e1f20 !important;
                box-shadow: 0 8px 25px rgba(0,0,0,0.4) !important;
            }

            /* 伪元素标签 */
            ms-chat-turn::before {
                position: absolute;
                top: -14px;
                left: 20px;
                padding: 2px 14px;
                font-size: 11px;
                font-weight: 900;
                border-radius: 8px;
                z-index: 100;
                text-transform: uppercase;
                box-shadow: 0 4px 8px rgba(0,0,0,0.5);
                letter-spacing: 1px;
                color: #111;
            }

            /* --- USER: 粉色调 --- */
            ms-chat-turn[data-role="user"] {
                border-left: 6px solid #ff8fa3 !important;
                background: rgba(255, 143, 163, 0.04) !important;
            }
            ms-chat-turn[data-role="user"]::before { content: "USER"; background: #ff8fa3; }

            /* --- MODEL: 紫色调 --- */
            ms-chat-turn[data-role="model"] {
                border-left: 6px solid #b39ddb !important;
                background: rgba(179, 157, 219, 0.04) !important;
            }
            ms-chat-turn[data-role="model"]::before { content: "MODEL"; background: #b39ddb; }

            /* --- THINKING: 青色调 (思维链独立块) --- */
            ms-chat-turn[data-role="thought"] {
                border-left: 6px solid #387896ff !important;
                background: rgba(79, 195, 247, 0.04) !important;
            }
            ms-chat-turn[data-role="thought"]::before { content: "THINKING"; background: #4fc3f7; }

            /* 思维链美化 */
            ms-thought-chunk {
                background: #131314 !important;
                border: 1px solid #3c4043 !important;
                border-radius: 12px !important;
                margin: 10px 0 !important;
                padding: 12px !important;
                display: block !important;
            }

            /* 内容清理 */
            .author-label, .role-label, ms-chat-turn > div:first-child:not([class]) {
                display: none !important;
            }
            .chat-content-container, .border-t, .border-b { border: none !important; }
            ms-cmark-node, .user-query-text, .model-response-text {
                color: #f0f0f0 !important;
                line-height: 1.7 !important;
                font-size: 15px !important;
            }

            /* 导出按钮面板 */
            .gemini-panel { position: fixed; bottom: 80px; right: 30px; z-index: 99999; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
            .gemini-menu { display: none; flex-direction: column; gap: 6px; background: #232426; border: 1px solid #444; padding: 10px; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); }
            .gemini-menu.show { display: flex; }
            .gemini-btn { background: #333; color: #eee; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; text-align: center; border: 1px solid #555; }
            .gemini-main-btn { padding: 0 20px; height: 44px; border-radius: 22px; background: linear-gradient(135deg, #ff8fa3, #b39ddb); color: #111; cursor: pointer; font-weight: 900; display: flex; align-items: center; box-shadow: 0 4px 15px rgba(255,143,163,0.3); border:none; }
        `;
        document.head.appendChild(style);
    }

    // --- 2. 核心识别逻辑优化 ---
    function tagOneTurn(turn) {
        if (!turn || turn.tagName !== 'MS-CHAT-TURN') return;

        // 识别 User
        const isUser = turn.querySelector('.user-prompt-container') || turn.getAttribute('data-turn-role') === 'User';
        // 识别 思维链 (Thought)
        const hasThoughtChunk = turn.querySelector('ms-thought-chunk');
        // 识别 是否有最终回答正文 (排除掉在思维链内部出现的文字块)
        const hasResponse = turn.querySelector('ms-response-chunk') ||
                           (turn.querySelector('ms-text-chunk') && !turn.querySelector('ms-thought-chunk ms-text-chunk'));

        let targetRole = "model";
        if (isUser) {
            targetRole = "user";
        } else if (hasThoughtChunk && !hasResponse) {
            targetRole = "thought";
        }

        // 仅在属性改变时更新 DOM，提升长对话流畅度
        if (turn.getAttribute('data-role') !== targetRole) {
            turn.setAttribute('data-role', targetRole);
        }
    }

    // --- 3. MutationObserver 监听器 (高效平滑) ---
    const observer = new MutationObserver((mutations) => {
        let needsUpdate = false;
        mutations.forEach(mutation => {
            // 增量监听：只处理新添加的节点
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    if (node.tagName === 'MS-CHAT-TURN') tagOneTurn(node);
                    const subTurns = node.querySelectorAll('ms-chat-turn');
                    if (subTurns.length) subTurns.forEach(tagOneTurn);
                    needsUpdate = true;
                }
            });
            // 状态同步：处理已存在的节点从 Thinking 变为 Model 的过程
            if (mutation.target && mutation.target.tagName === 'MS-CHAT-TURN') {
                tagOneTurn(mutation.target);
            }
        });

        // 针对当前活跃对话实时同步状态
        const turns = document.querySelectorAll('ms-chat-turn');
        if (turns.length > 0) tagOneTurn(turns[turns.length - 1]);

        if (needsUpdate) initUI();
    });

    // --- 4. 导出逻辑 ---
    function getConversationData() {
        return Array.from(document.querySelectorAll('ms-chat-turn')).map(turn => {
            const role = turn.getAttribute('data-role') || 'unknown';
            // 提取正文 (排除思维链内的文本)
            const textChunks = Array.from(turn.querySelectorAll('ms-text-chunk'))
                                    .filter(node => !node.closest('ms-thought-chunk'))
                                    .map(node => node.innerText.trim())
                                    .join('\n');
            // 提取思维链
            const thoughtsEl = turn.querySelector('ms-thought-chunk');
            const thoughts = thoughtsEl ? thoughtsEl.innerText.replace(/Expand to view model thoughts|Collapse to hide model thoughts/g, '').trim() : "";

            return { role, content: textChunks, thoughts };
        }).filter(m => m.content || m.thoughts);
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    // --- 5. 构建面板 (采用标准 DOM 构造规避安全限制) ---
    function initUI() {
        injectStyles();
        if (document.querySelector('.gemini-panel')) return;

        const wrap = document.createElement('div');
        wrap.className = 'gemini-panel';

        const menu = document.createElement('div');
        menu.className = 'gemini-menu';

        const createBtn = (text, color, action) => {
            const btn = document.createElement('div');
            btn.className = 'gemini-btn';
            btn.textContent = text;
            btn.style.color = color;
            btn.onclick = (e) => { e.stopPropagation(); action(); };
            return btn;
        };

        menu.appendChild(createBtn('📝 Export Markdown', '#ff8fa3', () => {
            const data = getConversationData();
            let md = `# Gemini Chat Export\n\n${data.map(m => `### ${m.role.toUpperCase()}\n${m.thoughts ? '> **Thoughts:**\n> ' + m.thoughts.replace(/\n/g, '\n> ') + '\n\n' : ''}${m.content}`).join('\n\n---\n\n')}`;
            downloadFile(md, `gemini_${Date.now()}.md`, 'text/markdown');
            menu.classList.remove('show');
        }));

        menu.appendChild(createBtn('📦 Export JSON', '#b39ddb', () => {
            const data = getConversationData();
            downloadFile(JSON.stringify({ messages: data }, null, 2), `gemini_data_${Date.now()}.json`, 'application/json');
            menu.classList.remove('show');
        }));

        const mainBtn = document.createElement('div');
        mainBtn.className = 'gemini-main-btn';
        mainBtn.textContent = '✨ Export';
        mainBtn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle('show'); };

        window.addEventListener('click', () => menu.classList.remove('show'));

        wrap.appendChild(menu);
        wrap.appendChild(mainBtn);
        document.body.appendChild(wrap);
    }

    // 启动
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('ms-chat-turn').forEach(tagOneTurn);
    initUI();
})();