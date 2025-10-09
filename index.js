(async function () {
    // create dialog elements
    if (window.dmExtracts) {
        window.dmExtracts.open = true;
        return;
    }
    window.arrowTables = {};
    const dialog = window.dmExtracts = document.createElement("ui5-dialog");
    const content = document.createElement("div");
    const footer = document.createElement("footer");
    const footerBtn = document.createElement("ui5-button");
    // set attributes
    dialog.setAttribute("header-text", "SE16");
    footer.setAttribute("slot", "footer");
    dialog.style.width = "80%";
    dialog.style.minWidth = "300px";
    dialog.style.height = "80%";
    dialog.style.minHeight = "300px";
    // content
    content.innerHTML = "<h3>Hello!<h3><p>Please wait.</p>";
    Promise.all([
        loadArrowScripts(),
        fetchTableIndex()
    ]).then(async ([_, tableIndex]) => {
        const airLines = tableIndex.map(t => t.airline).filter(a => a);
        let onDataLoaded;
        const dataLoaded = new Promise((v) => onDataLoaded = v);
        let airline = '';
        if (airLines > 1) {
            content.innerHTML = `<label for="airlineGroup">Airline Group:</label>`;
            const airlineEl = document.createElement("select");
            const optionAF = document.createElement("option");
            optionAF.value = 'AF'; optionAF.innerHTML = "Air France";
            airlineEl.appendChild(optionAF);
            const optionKLM = document.createElement("option");
            optionKLM.value = 'KLM'; optionKLM.innerHTML = "KLM";
            airlineEl.appendChild(optionKLM);
            airlineEl.name = "airlineGroup";
            content.appendChild(airlineEl);
        } else {
            content.innerHTML = ``;
            airline = airLines[0]
        }
        if (airline) {
            const airlineTables = tableIndex.filter(t => t.airline === airline);
            console.table(airlineTables)
            for (const { id } of airlineTables) {
                try {
                    const resp = await fetch(`/odata/v2/cust_dm('${id}')/cust_contentNav?$select=fileContent`, { headers: { accept: "application/json" } })
                    const jsonData = await resp.json();
                    const fileContent = jsonData.d?.fileContent;
                    // yes, double encoding: base64 of utf8 of base64
                    const uint8Array = Uint8Array.fromBase64(atob(fileContent));
                    const arrowTable = await parseArrowTable('default', uint8Array);
                    window.arrowTables[id] = arrowTable;
                } catch (e) {
                    console.error(e);

                }
            }
        }
        const secretEl = document.createElement("ui5-input");
        secretEl.type = "Password";
        secretEl.name = "secret";
        secretEl.required = true;
        secretEl.noTypeahead = true;
        secretEl.valueState = "Negative";
        secretEl.onchange = () => {
            console.log("secretEl", secretEl.value)
        }
        secretEl.oninput = () => {
            if (secretEl.value?.length >= 8) {
                secretEl.valueState = "Positive";
            } else {
                secretEl.valueState = "Negative";
            }
        }
        content.appendChild(secretEl);
    })
    content.style.padding = "1rem";
    // footer btn
    footerBtn.onclick = () => dialog.open = false;
    footerBtn.innerHTML = "Close";
    // append elements
    dialog.appendChild(content);
    dialog.appendChild(footer);
    footer.appendChild(footerBtn);
    document.body.appendChild(dialog);
    // open dialog
    dialog.open = true;
    async function loadScript(src) {
        return new Promise((v, j) => {
            const script = document.createElement('script');
            script.onload = function (e) {
                v(e);
            };
            script.src = src;
            script.async = false;
            document.head.appendChild(script);
        });
    }
    async function parseArrowTable(key, uint8Data) {
        // need to decrypt the binary data
        const decrypted = await decrypt_bytes(uint8Data, key);
        // need to inflate the binary data
        const inflated = await inflate_bytes(decrypted);
        // need to parse the arrow table
        const zpernrTable = Arrow.tableFromIPC(inflated);
        return zpernrTable;
    }
    async function decrypt_bytes(bytes, key) {
        const key32 = new Uint8Array(32)
        const iv = bytes.subarray(0, 12); // first 12 bytes
        bytes = bytes.subarray(12); // the rest is the ciphertext
        key.padEnd(32, '+').split('').forEach((c, i) => key32[i] = c.charCodeAt(0))
        const secretKey = await crypto.subtle.importKey(
            'raw',
            key32,
            {
                name: 'AES-GCM',
                length: 256
            }, true, ['encrypt', 'decrypt']);
        return await crypto.subtle.decrypt({
            name: 'AES-GCM',
            iv,
        }, secretKey, bytes);

    }
    async function inflate_bytes(bytes) {
        const cs = new DecompressionStream('deflate-raw');
        const blobData = new Blob([bytes]).stream();
        const chunks = [];
        for await (const chunk of blobData.pipeThrough(cs)) {
            chunks.push(chunk);
        }
        const blob = new Blob(chunks);
        return new Uint8Array(await blob.arrayBuffer());
    }
    async function loadArrowScripts() {
        const srcAr = `https://cdn.jsdelivr.net/npm/apache-arrow@21.1.0/Arrow.es2015.min.js`;
        const srcAq = `https://cdn.jsdelivr.net/npm/arquero@8.0.3/dist/arquero.min.js`;
        return loadScript(srcAr).then(_ => loadScript(srcAq))
    }
    async function fetchTableIndex() {
        try {
            const resp = await fetch(`/odata/v2/cust_dm?$select=id,name,cust_Airline`, { headers: { accept: "application/json" } });
            const jsonData = await resp.json();
            return jsonData.d?.results?.map(r => ({ id: r.id, name: r.name, airline: r.cust_Airline }))
        } catch (e) {
            console.error(e);
        }
    }

})();
