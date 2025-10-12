(async function (globalThis) {
    const jerp = globalThis.jerp ? globalThis.jerp : globalThis.jerp = {};
    const valueCache = jerp.valueCache ? jerp.valueCache : jerp.valueCache = new Map();
    jerp.libReady = loadLib();
    async function loadLib() {
        const libSources = await fetchLibSources();
        for (const { id, content } of libSources) {
            if (id.endsWith('.js') && content) {
                try {
                    await loadScript(content);
                } catch (e) {
                    console.debug(`Error loading script ${id}:`, e);
                }
            } else if (id.endsWith('.json') && content) {
                try {
                    const jsonStr = new TextDecoder().decode(content);
                    const value = JSON.parse(jsonStr);
                    valueCache.set(id, value);
                } catch (e) {
                    console.debug(`Error parsing JSON ${id}:`, e);
                }
            }
        }
    }
    async function loadScript(content) {
        const blob = new Blob([content], { type: 'application/javascript' });
        const src = URL.createObjectURL(blob);
        return new Promise((v, j) => {
            const script = document.createElement('script');
            script.onload = function (e) {
                v(e);
            };
            script.src = src;
            script.async = false;
            document.head.appendChild(script);
            URL.revokeObjectURL(src);
        });
    }
    async function fetchLibSources() {
        const query = `cust_dm?$select=id,cust_contentB64&$filter=cust_group eq 'lib'&$orderby=id`;
        try {
            const resp = await fetch(`/odata/v2/${query}`, { headers: { accept: "application/json" } });
            const jsonData = await resp.json();
            return jsonData.d?.results?.map(r => {
                try {
                    return { id: r.id, content: Uint8Array.fromBase64(r.cust_contentB64) };
                } catch (e) {
                    return null;
                }
            })
                .map(s => s);
        } catch (e) {
            console.error(e);
        }
    }

})(this);
