var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// src/host-legacy.ts
var exports_host_legacy = {};
async function legacyLoad() {
  const me = window;
  const jerp = me.jerp ? me.jerp : me.jerp = {};
  const valueCache = jerp.valueCache ? jerp.valueCache : jerp.valueCache = new Map;
  jerp.libReady = loadLib();
  async function loadLib() {
    const libSources = await fetchLibSources();
    if (!libSources) {
      return;
    }
    for (const { id, content } of libSources) {
      if (id.endsWith(".js") && content) {
        try {
          await loadScript(content);
        } catch (e) {
          console.debug(`Error loading script ${id}:`, e);
        }
      } else if (id.endsWith(".json") && content) {
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
    const blob = new Blob([content], { type: "application/javascript" });
    const src = URL.createObjectURL(blob);
    return new Promise((v, j) => {
      const script = document.createElement("script");
      script.onload = function(e) {
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
      const results = jsonData.d?.results;
      return results.map((r) => {
        try {
          return { id: r.id, content: Uint8Array.fromBase64(r.cust_contentB64) };
        } catch (e) {
          return null;
        }
      }).filter((s) => s !== null);
    } catch (e) {
      console.error(e);
      return;
    }
  }
}
var init_host_legacy = __esm(() => {
  legacyLoad();
});

// src/logger.ts
function NoOp() {}
function getLogger(logLevel = "error") {
  const levels = ["debug", "log", "info", "warn", "error"];
  const logLevelIndex = levels.indexOf(logLevel);
  if (logLevelIndex < 0) {
    return {
      debug: NoOp,
      log: NoOp,
      info: NoOp,
      warn: NoOp,
      error: NoOp
    };
  }
  return new Proxy(console, {
    get(target, prop, receiver) {
      const propIndex = levels.indexOf(prop);
      if (propIndex >= 0 && propIndex < logLevelIndex) {
        return NoOp;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

// src/messaging.ts
function channelMessageHandler(port, handlers, opts) {
  let messageId = 0;
  let logger = getLogger(opts?.logLevel);
  const onNotificationCallback = {
    ...opts?.onNotificationCallback,
    setLogLevel(level) {
      logger = getLogger(level);
    }
  };
  const pendingMessages = new Map;
  port.onmessage = async (e) => {
    const message = e.data;
    if (message.type === "response") {
      handleIncomingResponse(message);
    } else if (message.type === "request") {
      handleIncomingRequest(message);
    } else if (message.type === "notification") {
      handleIncomingNotification(message);
    }
  };
  return {
    terminate() {
      if (pendingMessages.size > 0) {
        for (const [_id, handlers2] of pendingMessages.entries()) {
          handlers2.reject("Worker terminated");
        }
        pendingMessages.clear();
      }
      logger.info(`Terminating`);
      port.close();
    },
    sendRequest(message, options) {
      return new Promise((resolve, reject) => {
        const id = ++messageId;
        pendingMessages.set(id, { resolve, reject });
        try {
          sendMessage({
            ...message,
            id,
            type: "request"
          }, options);
        } catch (error) {
          pendingMessages.delete(id);
          reject(error);
        }
      });
    },
    notify(message, options) {
      logger.debug(`Notify`, message);
      sendMessage({ ...message, type: "notification" }, options);
    },
    get logger() {
      return logger;
    }
  };
  function sendMessage(message, options) {
    logger.debug(`Sending`, message);
    port.postMessage(message, options);
  }
  async function handleIncomingNotification(message) {
    const { name, data } = message;
    const callback = onNotificationCallback[name];
    if (callback) {
      try {
        callback(data);
      } catch (error) {
        logger.error(`Error handling notification '${name}':`, error);
      }
    } else {}
  }
  async function handleIncomingRequest(message) {
    const { id: requestId, name, args } = message;
    const handler = name && name in handlers ? handlers[name] : undefined;
    if (!handler) {
      const responseMessage = {
        type: "response",
        id: requestId,
        ok: false,
        result: `Function '${name}' not found`
      };
      sendMessage(responseMessage);
      return;
    }
    const handlerResult = handler.apply(undefined, args ?? []);
    try {
      if (isPromise(handlerResult)) {
        const awaitedHandlerResult = await handlerResult;
        sendResponseMessage(requestId, awaitedHandlerResult);
      } else if (isGeneratorObject(handlerResult)) {
        for await (const handlerResultItem of handlerResult) {
          sendResponseMessage(requestId, handlerResultItem);
        }
      } else {
        sendResponseMessage(requestId, handlerResult);
      }
    } catch (error) {
      const responseMessage = {
        type: "response",
        id: requestId,
        ok: false,
        result: error.message || String(error)
      };
      sendMessage(responseMessage);
    }
  }
  async function handleIncomingResponse(message) {
    const { id, ok, result } = message;
    const handlers2 = pendingMessages.get(id);
    pendingMessages.delete(id);
    if (!handlers2) {
      console.warn("Received response for unknown message:", message);
      return;
    }
    if (ok) {
      handlers2.resolve(result);
    } else {
      handlers2.reject(result ?? "Unknown error from worker");
    }
  }
  function sendResponseMessage(requestId, handlerResult) {
    let result;
    let options;
    if (handlerResult && typeof handlerResult === "object" && "result" in handlerResult) {
      result = handlerResult.result;
      options = handlerResult.options;
    } else {
      result = handlerResult;
    }
    const responseMessage = {
      type: "response",
      id: requestId,
      ok: true,
      result
    };
    sendMessage(responseMessage, options);
  }
  function isPromise(value) {
    return value != null && typeof value.then === "function" && typeof value.catch === "function";
  }
  function isGeneratorObject(value) {
    return value != null && typeof value.next === "function" && typeof value.return === "function";
  }
}

// src/incubate-child.ts
async function incubateChildChannel(hostName, targetWindow, targetOrigin, logLevel) {
  if (!targetWindow) {
    throw new Error("Failed to open moulinette tab");
  }
  const messageChannel = new MessageChannel;
  const hostPort = messageChannel.port1;
  const guestPort = messageChannel.port2;
  targetWindow.postMessage(hostName, targetOrigin, [guestPort]);
  return new Promise((resolve, _reject) => {
    hostPort.onmessage = async (_) => {
      hostPort.onmessage = null;
      const { terminate, notify } = channelMessageHandler(hostPort, {
        async fetch(url, init) {
          const response = await fetch(url, init);
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            result: {
              status: response.status,
              statusText: response.statusText,
              headers,
              body: response.body,
              url: response.url,
              ok: response.ok
            },
            options: response.body ? { transfer: [response.body] } : undefined
          };
        }
      }, logLevel ? { logLevel } : undefined);
      resolve({
        terminate,
        setLogLevel(level) {
          notify({ name: "setLogLevel", data: level });
        }
      });
    };
  });
}

// src/host.ts
function createIframeDialog() {
  var dialog = document.createElement("ui5-dialog");
  var production = false;
  dialog.id = "moulinette-dialog";
  dialog.setAttribute("stretch", "true");
  const iframe = document.createElement("iframe");
  const iframeSrc = production ? "http://localhost:5173/moulinette.html" : "http://localhost:5173/moulinette.html?" + new Date().getTime();
  const iframeOrigin = new URL(iframeSrc).origin;
  iframe.src = iframeSrc;
  iframe.title = "Moulinette IFrame";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  dialog.appendChild(iframe);
  document.body.appendChild(dialog);
  dialog.open = true;
  iframe.onload = () => {
    incubateChildChannel("host", iframe?.contentWindow, iframeOrigin).then(({ terminate }) => {
      dialog.addEventListener("ui5-dialog-close", () => {
        terminate();
      });
    }).catch((err) => {
      console.error("Error incubating tab channel:", err);
    });
  };
}
if (localStorage.getItem("dm") === "v2") {
  createIframeDialog();
} else {
  Promise.resolve().then(() => init_host_legacy());
}
