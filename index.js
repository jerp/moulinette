(function () {
    // create dialog elements
    const dialog = document.createElement("ui5-dialog");
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
    content.innerHTML = "Hello Moulinette!!";
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
})();
