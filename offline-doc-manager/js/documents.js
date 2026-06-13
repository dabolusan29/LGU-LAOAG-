let editingId = null;
let currentPage = 1;
const itemsPerPage = 10;
let currentProjectsList = [];
let activeWorkspace = "dashboard";

// Framework looping handshake detector to verify DB availability
const initInterval = setInterval(() => {
    if (window.dbReady) {
        clearInterval(initInterval);
        switchWorkspace("dashboard");
        loadDocuments();
    }
}, 150);

/* ==========================================================================
   WORKSPACE CLASS-DRIVEN VISIBILITY ROUTING MATRIX
   ========================================================================== */
function switchWorkspace(targetWorkspace) {
    activeWorkspace = targetWorkspace;
    
    // Reset active marker links on menu elements
    const tabButtons = document.querySelectorAll("#workspaceTabs .nav-link");
    tabButtons.forEach(btn => btn.classList.remove("active"));
    
    const container = document.getElementById("workspaceContainer");
    const formSection = document.getElementById("formSection");
    const tableSection = document.getElementById("tableSection");

    // Clear class list tracking route states safely
    container.classList.remove("view-dashboard", "view-add-edit", "view-documents", "view-combined");

    if (targetWorkspace === "dashboard") {
        findTabButtonByText("dashboard").classList.add("active");
        container.classList.add("view-dashboard");
    } 
    else if (targetWorkspace === "add-edit") {
        findTabButtonByText("add").classList.add("active"); // matches 'Add/Edit Project'
        container.classList.add("view-add-edit");
        formSection.className = "col-md-8 col-lg-6 mx-auto";
    } 
    else if (targetWorkspace === "documents") {
        findTabButtonByText("documents").classList.add("active"); // matches 'Documents Registry'
        container.classList.add("view-documents");
        tableSection.className = "col-12";
    } 
    else if (targetWorkspace === "combined") {
        findTabButtonByText("combined").classList.add("active");
        container.classList.add("view-combined");
        formSection.className = "col-xl-4 col-lg-5";
        tableSection.className = "col-xl-8 col-lg-7";
    }

    setTimeout(initializeLiveValueTracking, 20);
}

// Fixed helper function to ignore emojis, spaces, and lettering cases
function findTabButtonByText(keyword) {
    const buttons = document.querySelectorAll("#workspaceTabs .nav-link");
    for (let btn of buttons) {
        if (btn.textContent.toLowerCase().includes(keyword.toLowerCase())) {
            return btn;
        }
    }
    // Safe fallback if it absolute fails to match anything
    return buttons[0];
}

/* ==========================================================================
   SYSTEM TOAST NOTIFICATIONS BANNER ACTIONS
   ========================================================================== */
function showSystemNotification(message) {
    const toastBody = document.getElementById("toastMessageBody");
    const toastEl = document.getElementById("actionFeedbackToast");
    if (toastBody && toastEl) {
        toastBody.textContent = message;
        const bsToast = bootstrap.Toast.getOrCreateInstance(toastEl);
        bsToast.show();
    }
}

function saveDocument() {
    const title = document.getElementById("title").value.trim();
    
    if (!title) {
        alert("'Name of Project' is a required field.");
        return;
    }

    const docPayload = {
        title: title,
        approvedBudget: document.getElementById("approvedBudget").value.trim(),
        winningBidder: document.getElementById("winningBidder").value.trim(),
        bidAmount: document.getElementById("bidAmount").value.trim(),
        biddingDate: document.getElementById("biddingDate").value,
        contractDuration: document.getElementById("contractDuration").value.trim(), 
        noa: document.getElementById("noa").value, 
        performanceBond: document.getElementById("performanceBond").value, 
        contractRef: document.getElementById("contractRef").value, 
        dole: document.getElementById("dole").value, 
        contractEndDate: document.getElementById("contractEndDate").value, 
        ntpDate: document.getElementById("ntpDate").value, 
        completion: document.getElementById("completionDate").value, 
        liquidatedDamages: document.getElementById("liquidatedDamages").value.trim(),
        remarks: document.getElementById("remarks").value.trim(),
        inOut: document.getElementById("inOut").value,
        status: document.getElementById("status").value,
        updatedAt: new Date().toISOString()
    };

    if (editingId === null) {
        const transaction = db.transaction(["projects"], "readonly");
        const store = transaction.objectStore("projects");
        const countRequest = store.count();

        countRequest.onsuccess = () => {
            const totalCount = countRequest.result;
            docPayload.projectNo = String(totalCount + 1); 
            addDocument(docPayload);
        };
    } else {
        updateDocument(editingId, docPayload);
    }
}

function addDocument(payload) {
    payload.createdAt = new Date().toISOString();
    const transaction = db.transaction(["projects"], "readwrite");
    const store = transaction.objectStore("projects");
    
    store.add(payload);
    transaction.oncomplete = () => {
        showSystemNotification(`🎉 Project successfully added into the database: "${payload.title}"`);
        resetFormAccess();
        loadDocuments();
        
        if (activeWorkspace !== "combined") {
            switchWorkspace("documents");
        }
    };
}

function updateDocument(id, payload) {
    const transaction = db.transaction(["projects", "history"], "readwrite");
    const projectStore = transaction.objectStore("projects");
    const historyStore = transaction.objectStore("history");

    projectStore.get(id).onsuccess = (e) => {
        const currentRecord = e.target.result;
        
        historyStore.add({
            projectId: id,
            editedAt: new Date().toISOString(),
            changes: JSON.stringify(currentRecord)
        });

        payload.projectNo = currentRecord.projectNo || "1";

        const updatedRecord = { ...currentRecord, ...payload };
        projectStore.put(updatedRecord);
    };

    transaction.oncomplete = () => {
        // UI & State synchronization triggers first
        resetFormAccess();
        loadDocuments();
        
        if (activeWorkspace !== "combined") {
            switchWorkspace("documents");
        }

        // Delay toast slightly using setTimeout so DOM recalculations do not clear it
        setTimeout(() => {
            showSystemNotification(`✅ Project records changes successfully saved: "${payload.title}"`);
        }, 100);
    };
}

function loadDocuments() {
    if (!db) return;

    const searchTerm = document.getElementById("searchInput") ? document.getElementById("searchInput").value.trim().toLowerCase() : "";
    const filterStatus = document.getElementById("filterStatusSelect") ? document.getElementById("filterStatusSelect").value : "All";
    const filterInOut = document.getElementById("filterInOutSelect") ? document.getElementById("filterInOutSelect").value : "All";
    
    // Grab both separate date filtering variables
    const filterBiddingDate = document.getElementById("filterBiddingDate") ? document.getElementById("filterBiddingDate").value : "";
    const filterNoaDate = document.getElementById("filterNoaDate") ? document.getElementById("filterNoaDate").value : "";

    const transaction = db.transaction(["projects"], "readonly");
    const store = transaction.objectStore("projects");
    const request = store.getAll();

    request.onsuccess = function() {
        let records = request.result || [];

        // Explicitly sort loaded datasets numerically by sequence assignment numbers
        records.sort((a, b) => Number(a.projectNo || 0) - Number(b.projectNo || 0));

        let filtered = records.filter(item => {
            const matchSearch = !searchTerm || 
                (item.title && item.title.toLowerCase().includes(searchTerm)) ||
                (item.winningBidder && item.winningBidder.toLowerCase().includes(searchTerm)) ||
                (item.projectNo && item.projectNo.toString().includes(searchTerm));

            const matchStatus = (filterStatus === "All") || (item.status === filterStatus);
            const matchInOut = (filterInOut === "All") || (item.inOut === filterInOut);
            
            // Apply targeted evaluation for isolated Bidding and NOA Date parameter blocks
            const matchBiddingDate = !filterBiddingDate || (item.biddingDate === filterBiddingDate);
            const matchNoaDate = !filterNoaDate || (item.noa === filterNoaDate);

            return matchSearch && matchStatus && matchInOut && matchBiddingDate && matchNoaDate;
        });

        // Store globally scoped search array reference
        currentProjectsList = filtered;

        updateMetricsDashboard(records);
        renderTablePage();
    };

    request.onerror = function(e) {
        console.error("Failed to query project logs during table redraw:", e);
    };
}

function formatUIDate(dateVal) {
    if (!dateVal) return "-";
    
    let dateStr = dateVal;
    if (dateVal instanceof Date) {
        const y = dateVal.getFullYear();
        const m = String(dateVal.getMonth() + 1).padStart(2, '0');
        const d = String(dateVal.getDate()).padStart(2, '0');
        dateStr = `${y}-${m}-${d}`;
    }

    const parts = dateStr.split('-');
    if (parts.length !== 3) return String(dateVal);

    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parts[2].padStart(2, '0');

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (monthIdx < 0 || monthIdx > 11) return String(dateVal);

    return `${months[monthIdx]} ${day}, ${year}`;
}

function getAwardingDate(completionDateStr) {
    if (!completionDateStr) return null;
    
    const parts = completionDateStr.split('-');
    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; 
    const day = parseInt(parts[2], 10);
    
    const target = new Date(year, month, day);
    if (isNaN(target.getTime())) return null;
    
    target.setFullYear(target.getFullYear() + 1);
    return target;
}

/* ==========================================================================
   Notice of Award (NOA) 15-Day Tracking Core Helpers
   ========================================================================== */
function checkNoaFifteenDayWindowAlert(noaDateStr, status) {
    if (!noaDateStr || status === "Completed") return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const noaDate = new Date(noaDateStr);
    if (isNaN(noaDate.getTime())) return false;
    noaDate.setHours(0, 0, 0, 0);

    const noaDeadlineDate = new Date(noaDate.getTime());
    noaDeadlineDate.setDate(noaDeadlineDate.getDate() + 15);
    noaDeadlineDate.setHours(0, 0, 0, 0);

    return today >= noaDate && today <= noaDeadlineDate;
}

function getNoaDaysRemaining(noaDateStr) {
    if (!noaDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const noaDate = new Date(noaDateStr);
    if (isNaN(noaDate.getTime())) return null;
    
    const noaDeadlineDate = new Date(noaDate.getTime());
    noaDeadlineDate.setDate(noaDeadlineDate.getDate() + 15);
    noaDeadlineDate.setHours(0, 0, 0, 0);

    const timeDiff = noaDeadlineDate.getTime() - today.getTime();
    return Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
}

function checkFifteenDayWindowAlert(completionDateStr, status) {
    if (!completionDateStr) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const awardingDate = getAwardingDate(completionDateStr);
    if (!awardingDate) return false;
    awardingDate.setHours(0, 0, 0, 0);
    
    const fifteenDaysBeforeAwarding = new Date(awardingDate.getTime());
    fifteenDaysBeforeAwarding.setDate(fifteenDaysBeforeAwarding.getDate() - 15);
    
    const isOverdue = today >= awardingDate;
    const isApproachingWindow = today >= fifteenDaysBeforeAwarding && today < awardingDate;
    
    return isOverdue || isApproachingWindow;
}

function renderTablePage() {
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    
    const paginatedItems = currentProjectsList.slice(startIdx, endIdx);

    let html = "";
    paginatedItems.forEach(doc => {
        const isCompletionAlertActive = checkFifteenDayWindowAlert(doc.completion, doc.status);
        const isNoaAlertActive = checkNoaFifteenDayWindowAlert(doc.noa, doc.status);
        
        const rowClass = (isCompletionAlertActive || isNoaAlertActive) ? "table-danger" : "";
        const awardingDateObj = getAwardingDate(doc.completion);
        
        const directionBadge = doc.inOut 
            ? `<span class="badge bg-secondary">${doc.inOut}</span>` 
            : `<span class="text-muted small"><em>None</em></span>`;

        let alertBadgesHtml = "";
        if (isNoaAlertActive) {
            const daysLeft = getNoaDaysRemaining(doc.noa);
            alertBadgesHtml += ` <span class="badge bg-warning text-dark overdue-blink">⏰ NOA Window (${daysLeft}d left)</span>`;
        }
        if (isCompletionAlertActive) {
            alertBadgesHtml += ` <span class="badge bg-danger overdue-blink">⚠️ Awarding Window</span>`;
        }

        html += `
            <tr class="${rowClass}">
                <td><strong>${doc.projectNo || '-'}</strong></td>
                <td>
                    <strong>${doc.title}</strong>
                    ${alertBadgesHtml}
                    <div class="small text-muted">Bidder: ${doc.winningBidder || '-'} | Duration: ${doc.contractDuration || '-'}</div>
                </td>
                <td>${formatUIDate(doc.biddingDate)}</td>
                <td>${formatUIDate(doc.ntpDate)}</td>
                <td>${formatUIDate(doc.contractEndDate)}</td>
                <td>
                    <div>Comp: ${formatUIDate(doc.completion)}</div>
                    <small class="text-secondary font-weight-bold">Award: ${awardingDateObj ? formatUIDate(awardingDateObj) : '-'}</small>
                </td>
                <td>${directionBadge}</td>
                <td><span class="badge bg-${doc.status === 'Completed' ? 'success' : 'warning'}">${doc.status}</span></td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button onclick="editDocument(${doc.id})" class="btn btn-warning">Edit</button>
                        <button onclick="viewHistory(${doc.id})" class="btn btn-outline-secondary">Logs</button>
                        <button onclick="deleteDocument(${doc.id})" class="btn btn-danger">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });

    const docTable = document.getElementById("documentTable");
    if (docTable) {
        docTable.innerHTML = html || `<tr><td colspan="9" class="text-center py-4 text-muted">No records match specified filter criteria.</td></tr>`;
    }
    renderPaginationControls();
}

function renderPaginationControls() {
    const totalItems = currentProjectsList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    
    if (currentPage > totalPages) currentPage = totalPages;

    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    
    const infoEl = document.getElementById("paginationInfo");
    if (infoEl) infoEl.textContent = `Showing ${startItem}-${endItem} of ${totalItems} entries`;

    let navHtml = `<ul class="pagination pagination-sm mb-0">`;
    navHtml += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Previous</a></li>`;
    
    for (let i = 1; i <= totalPages; i++) {
        navHtml += `<li class="page-item ${currentPage === i ? 'active' : ''}"><a class="page-link" href="#" onclick="changePage(${i})">${i}</a></li>`;
    }
    
    navHtml += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Next</a></li>`;
    navHtml += `</ul>`;
    
    const controlsEl = document.getElementById("paginationControls");
    if (controlsEl) controlsEl.innerHTML = navHtml;
}

function changePage(page) {
    if (page < 1 || page > Math.ceil(currentProjectsList.length / itemsPerPage)) return;
    currentPage = page;
    renderTablePage();
}

function updateMetricsDashboard(docs) {
    const total = docs.length;
    const pending = docs.filter(d => d.status === "Pending").length;
    const completed = docs.filter(d => d.status === "Completed").length;
    
    const activeAlertDocs = docs.filter(d => checkFifteenDayWindowAlert(d.completion, d.status));
    const activeNoaDocs = docs.filter(d => checkNoaFifteenDayWindowAlert(d.noa, d.status));
    const alertCount = activeAlertDocs.length + activeNoaDocs.length;

    const totalDocsEl = document.getElementById("totalDocs");
    const pendingDocsEl = document.getElementById("pendingDocs");
    const completedDocsEl = document.getElementById("completedDocs");
    const overdueDocsEl = document.getElementById("overdueDocs");

    if (totalDocsEl) totalDocsEl.textContent = total;
    if (pendingDocsEl) pendingDocsEl.textContent = pending;
    if (completedDocsEl) completedDocsEl.textContent = completed;
    if (overdueDocsEl) overdueDocsEl.textContent = alertCount; 

    const notificationList = document.getElementById("notificationList");
    const dashNotificationList = document.getElementById("dashboardNotificationList");
    let notificationHtml = "";
    let dashNotificationHtml = "";
    
    // Render Notice of Award (NOA) Active Alert List Segments
    activeNoaDocs.forEach(d => {
        const daysLeft = getNoaDaysRemaining(d.noa);
        const targetDate = new Date(d.noa);
        targetDate.setDate(targetDate.getDate() + 15);
        const formattedLimitString = formatUIDate(targetDate);

        notificationHtml += `<li class="text-warning mb-2 border-bottom pb-1"><strong>[NO: ${d.projectNo || 'N/A'}] ${d.title}</strong><br>⏰ NOA Tracker Active (${daysLeft} days remaining until ${formattedLimitString})</li>`;
        dashNotificationHtml += `<li class="list-group-item list-group-item-warning border-start border-warning border-3 my-1 rounded-1"><strong>[NO: ${d.projectNo || 'N/A'}]<sup>NOA</sup> ${d.title}</strong> — ⏰ Timeline Window (${daysLeft} days remaining until ${formattedLimitString})</li>`;
    });

    // Render Completion Window Alert List Segments
    activeAlertDocs.forEach(d => {
        const today = new Date();
        today.setHours(0,0,0,0);
        const awardingDate = getAwardingDate(d.completion);
        awardingDate.setHours(0,0,0,0);
        
        const formattedAwardString = formatUIDate(awardingDate);
        
        if (today >= awardingDate) {
            notificationHtml += `<li class="text-danger mb-2 border-bottom pb-1"><strong>[NO: ${d.projectNo || 'N/A'}] ${d.title}</strong><br>⚠️ AWARDING DEADLINE EXCEEDED (${formattedAwardString})</li>`;
            dashNotificationHtml += `<li class="list-group-item list-group-item-danger border-start border-danger border-3 my-1 rounded-1"><strong>[NO: ${d.projectNo || 'N/A'}] ${d.title}</strong> — ⚠️ AWARDING DEADLINE EXCEEDED (${formattedAwardString})</li>`;
        } else {
            notificationHtml += `<li class="text-warning mb-2 border-bottom pb-1"><strong>[NO: ${d.projectNo || 'N/A'}] ${d.title}</strong><br>⏰ Close Date for Awarding (${formattedAwardString})</li>`;
            dashNotificationHtml += `<li class="list-group-item list-group-item-warning border-start border-warning border-3 my-1 rounded-1"><strong>[NO: ${d.projectNo || 'N/A'}] ${d.title}</strong> — ⏰ Close Date for Awarding (${formattedAwardString})</li>`;
        }
    });
    
    const countEl = document.getElementById("notificationCount");
    if (countEl) countEl.textContent = alertCount;
    if (notificationList) notificationList.innerHTML = notificationHtml || "<li>No urgent timelines found.</li>";
    if (dashNotificationList) dashNotificationList.innerHTML = dashNotificationHtml || "<li class='list-group-item text-muted text-center py-3'>No urgent timelines found.</li>";
}

function toggleNotifications(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById("notificationAlertPanel");
    if (panel) {
        panel.classList.toggle("d-none");
    }
}

document.addEventListener("click", function (e) {
    const panel = document.getElementById("notificationAlertPanel");
    const bellBtn = document.getElementById("notificationBellBtn");
    if (panel && !panel.classList.contains("d-none") && bellBtn && !bellBtn.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.add("d-none");
    }
});

/* ==========================================================================
   DYNAMIC FORM FIELD HIGHLIGHTING ENGINE
   ========================================================================== */
const inputFieldsList = [
    "title", "approvedBudget", "winningBidder", "bidAmount", "biddingDate", 
    "contractDuration", "noa", "performanceBond", "contractRef", "dole", 
    "contractEndDate", "ntpDate", "completionDate", "liquidatedDamages", "remarks", "inOut"
];

function initializeLiveValueTracking() {
    inputFieldsList.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const evalContentState = () => {
            if (el.value.trim() !== "") {
                el.classList.add("has-value");
                el.classList.remove("editing-empty");
            } else {
                el.classList.remove("has-value");
                if (editingId !== null) {
                    el.classList.add("editing-empty");
                }
            }
        };

        el.removeEventListener("input", evalContentState);
        el.removeEventListener("change", evalContentState);
        el.addEventListener("input", evalContentState);
        el.addEventListener("change", evalContentState);

        evalContentState();
    });
}

function editDocument(id) {
    const transaction = db.transaction(["projects"], "readonly");
    const store = transaction.objectStore("projects");
    
    store.get(id).onsuccess = (e) => {
        const doc = e.target.result;
        editingId = id;

        const headerEl = document.getElementById("formHeader");
        if (headerEl) headerEl.textContent = `Modify Project Parameters (NO: ${doc.projectNo || 'N/A'})`;
        
        document.getElementById("title").value = doc.title || "";
        document.getElementById("approvedBudget").value = doc.approvedBudget || "";
        document.getElementById("winningBidder").value = doc.winningBidder || "";
        document.getElementById("bidAmount").value = doc.bidAmount || "";
        document.getElementById("biddingDate").value = doc.biddingDate || "";
        document.getElementById("contractDuration").value = doc.contractDuration || "";
        document.getElementById("noa").value = doc.noa || "";
        document.getElementById("performanceBond").value = doc.performanceBond || "";
        document.getElementById("contractRef").value = doc.contractRef || "";
        document.getElementById("dole").value = doc.dole || "";
        document.getElementById("contractEndDate").value = doc.contractEndDate || "";
        document.getElementById("ntpDate").value = doc.ntpDate || "";
        document.getElementById("completionDate").value = doc.completion || "";
        document.getElementById("liquidatedDamages").value = doc.liquidatedDamages || "";
        document.getElementById("remarks").value = doc.remarks || "";
        document.getElementById("inOut").value = doc.inOut || "";
        document.getElementById("status").value = doc.status || "Pending";

        const saveBtn = document.getElementById("saveBtn");
        if (saveBtn) saveBtn.textContent = "Apply Records Change";
        
        const cancelBtn = document.getElementById("cancelEditBtn");
        if (cancelBtn) cancelBtn.classList.remove("d-none");

        const titleArea = document.getElementById("title");
        if (titleArea) autoExpandTextarea(titleArea);

        if (activeWorkspace !== "combined") {
            switchWorkspace("add-edit");
        } else {
            document.getElementById("formHeader").scrollIntoView({ behavior: 'smooth' });
        }

        initializeLiveValueTracking();
    };
}

function resetFormAccess() {
    const wasEditing = (editingId !== null);
    editingId = null;
    const headerEl = document.getElementById("formHeader");
    if (headerEl) headerEl.textContent = "Add Project Record";
    
    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) saveBtn.textContent = "Save Project";
    
    const cancelBtn = document.getElementById("cancelEditBtn");
    if (cancelBtn) cancelBtn.classList.add("d-none");
    
    inputFieldsList.forEach(f => {
        const el = document.getElementById(f);
        if (el) {
            el.value = "";
            el.classList.remove("editing-empty", "has-value"); 
        }
    });

    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.value = "Pending";

    const titleArea = document.getElementById("title");
    if (titleArea) titleArea.style.height = "auto";

    if (wasEditing) {
        showSystemNotification("⚠️ Modification tracking mode terminated. Changes discarded.");
        if (activeWorkspace !== "combined") {
            switchWorkspace("documents");
        }
    }
}

function deleteDocument(id) {
    const userChoice = confirm(
        "⚠️ Confirm Record Deletion\n\n" +
        "Are you sure you want to permanently delete this project record from the local database?\n\n" +
        "• Click 'OK' to delete the record.\n" +
        "• Click 'Cancel' to abort and keep your files safe."
    );

    if (!userChoice) {
        showSystemNotification("❌ Deletion cancelled. Project record remains safe.");
        return;
    }

    const deleteTransaction = db.transaction(["projects"], "readwrite");
    const store = deleteTransaction.objectStore("projects");
    store.delete(id);

    deleteTransaction.oncomplete = () => {
        const reindexTransaction = db.transaction(["projects"], "readwrite");
        const reindexStore = reindexTransaction.objectStore("projects");
        
        reindexStore.getAll().onsuccess = (e) => {
            const records = e.target.result || [];
            
            records.sort((a, b) => Number(a.projectNo || 0) - Number(b.projectNo || 0));
            
            records.forEach((record, index) => {
                const updatedNo = String(index + 1);
                if (record.projectNo !== updatedNo) {
                    record.projectNo = updatedNo;
                    record.updatedAt = new Date().toISOString();
                    reindexStore.put(record);
                }
            });
        };

        reindexTransaction.oncomplete = () => {
            window.deletedProjectTitles = []; 
            showSystemNotification("🗑️ Record removed and project index numbers re-aligned successfully.");
            loadDocuments(); 
        };
    };

    deleteTransaction.onerror = (e) => {
        console.error("Database deletion transaction failed:", e);
        alert("❌ Error: Failed to remove project tracking logs from local browser storage.");
    };
}

/* ==========================================================================
   AUDITING TRAIL LOG TRACKING MAPS
   ========================================================================== */
const fieldLabelMap = {
    title: "Name of Project",
    approvedBudget: "Approved Budget for Contract (ABC)",
    winningBidder: "Winning Bidder",
    bidAmount: "Bid Amount",
    biddingDate: "Date of Bidding",
    contractDuration: "Contract Duration",
    noa: "Notice of Award (NOA) Date",
    performanceBond: "Performance Bond Date",
    contractRef: "Contract Date Reference",
    dole: "DOLE Clearance Date",
    contractEndDate: "Contract End Date",
    ntpDate: "Notice to Proceed (NTP) Date",
    completion: "Target Completion Date",
    liquidatedDamages: "Liquidated Damages",
    remarks: "Remarks",
    inOut: "In / Out Status",
    status: "Operational Status"
};

function viewHistory(projectId) {
    const transaction = db.transaction(["history", "projects"], "readonly");
    const historyStore = transaction.objectStore("history");
    const projectStore = transaction.objectStore("projects");

    projectStore.get(projectId).onsuccess = (pEvent) => {
        const currentLiveRecord = pEvent.target.result || {};

        historyStore.getAll().onsuccess = (hEvent) => {
            const records = hEvent.target.result.filter(h => h.projectId === projectId).reverse();
            let html = "";

            if (records.length === 0) {
                html = "<p class='text-muted p-2 text-center'>No previous modifications recorded for this project.</p>";
            } else {
                let subsequentState = currentLiveRecord;

                records.forEach((r, idx) => {
                    const oldDataSnapshot = JSON.parse(r.changes);
                    let changeLinesHtml = "";

                    Object.keys(fieldLabelMap).forEach(fieldKey => {
                        const oldValue = oldDataSnapshot[fieldKey] !== undefined ? oldDataSnapshot[fieldKey] : "";
                        const newValue = subsequentState[fieldKey] !== undefined ? subsequentState[fieldKey] : "";

                        if (String(oldValue).trim() !== String(newValue).trim()) {
                            const label = fieldLabelMap[fieldKey];
                            const displayOld = fieldKey.toLowerCase().includes('date') ? formatUIDate(oldValue) : (oldValue || "<em>None</em>");
                            const displayNew = fieldKey.toLowerCase().includes('date') ? formatUIDate(newValue) : (newValue || "<em>None</em>");

                            changeLinesHtml += `
                                <div class="mb-1 p-1 rounded" style="background-color: #fff3cd; border-left: 3px solid #ffc107; font-size: 12.5px;">
                                    <strong>${label}:</strong> 
                                    <span class="text-danger text-decoration-line-through">${displayOld}</span> 
                                    <span class="text-secondary mx-1">➔</span> 
                                    <span class="text-success font-weight-bold">${displayNew}</span>
                                </div>`;
                        }
                    });

                    if (!changeLinesHtml) {
                        changeLinesHtml = `<div class="text-muted small italic p-1">Form resaved without field value modifications.</div>`;
                    }

                    html += `
                        <div class="card mb-3 shadow-sm border-0">
                            <div class="card-header bg-dark text-white py-1 px-2 small d-flex justify-content-between" style="font-size: 11.5px;">
                                <span>Revision #${records.length - idx}</span>
                                <span>📅 ${new Date(r.editedAt).toLocaleString()}</span>
                            </div>
                            <div class="card-body p-2 bg-white">
                                ${changeLinesHtml}
                            </div>
                        </div>`;

                    subsequentState = oldDataSnapshot;
                });
            }

            const historyBody = document.getElementById("historyBody");
            if (historyBody) {
                historyBody.innerHTML = html;
                new bootstrap.Modal(document.getElementById("historyModal")).show();
            }
        };
    };
}

/* ==========================================================================
   EXCEL SHEET SYNCHRONIZATION PIPELINES
   ========================================================================== */
function exportToExcel() {
    const transaction = db.transaction(["projects"], "readonly");
    const request = transaction.objectStore("projects").getAll();

    request.onsuccess = () => {
        let rawData = request.result || [];
        if (rawData.length === 0) {
            alert("No available entries registered in local browser memory to export.");
            return;
        }

        // CRITICAL FIX: Numerical index sorting logic injected prior to sheet generation loop maps (1 to 47 sequence)
        rawData.sort((a, b) => Number(a.projectNo || 0) - Number(b.projectNo || 0));

        const sheetsRows = rawData.map(item => {
            const formatCurrency = (val) => {
                if (val === undefined || val === null || String(val).trim() === "") return "";
                const cleanNum = parseFloat(String(val).replace(/[^0-9.]/g, ''));
                if (isNaN(cleanNum)) return String(val);
                return cleanNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            const formatBlankDate = (dateVal) => {
                const formatted = formatUIDate(dateVal);
                return formatted === "-" ? "" : formatted;
            };

            return {
                "NO.": item.projectNo || "",
                "Name of Project": item.title || "",
                "Approved Budget for Contract": formatCurrency(item.approvedBudget),
                "Winning Bidder": item.winningBidder || "",
                "Bid Amount": formatCurrency(item.bidAmount),
                "Date of Bidding": formatBlankDate(item.biddingDate),
                "Contract Duration": item.contractDuration ? String(item.contractDuration).toUpperCase() : "",
                "NOA": formatBlankDate(item.noa),
                "PERFORMANCE BOND": formatBlankDate(item.performanceBond),
                "CONTRACT": formatBlankDate(item.contractRef), 
                "DOLE": formatBlankDate(item.dole),
                "CONTRACT END DATE": formatBlankDate(item.contractEndDate),
                "NTP": formatBlankDate(item.ntpDate),
                "Completion": formatBlankDate(item.completion),
                "Liquidated Damages": item.liquidatedDamages || "",
                "Remarks": item.remarks || "",
                "IN/OUT": item.inOut ? String(item.inOut).toUpperCase() : "",
                "OPERATIONAL STATUS": item.status || "Pending"
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(sheetsRows);

        if (worksheet['!ref']) {
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!worksheet[cellAddress]) {
                        worksheet[cellAddress] = { t: 's', v: '' };
                    }
                    
                    worksheet[cellAddress].s = {
                        border: {
                            top: { style: "thin", color: { rgb: "000000" } },
                            bottom: { style: "thin", color: { rgb: "000000" } },
                            left: { style: "thin", color: { rgb: "000000" } },
                            right: { style: "thin", color: { rgb: "000000" } }
                        }
                    };
                }
            }
        }

        const objectKeys = Object.keys(sheetsRows[0]);
        const columnWidths = objectKeys.map(key => {
            let maxCellLength = key.length;
            sheetsRows.forEach(row => {
                const cellValue = String(row[key] || '');
                if (cellValue.length > maxCellLength) {
                    maxCellLength = cellValue.length;
                }
            });
            return { wch: maxCellLength + 4 };
        });
        worksheet['!cols'] = columnWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Project Tracking Log");
        
        const fileTimestamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `Recorded_Project_Files_${fileTimestamp}.xlsx`);
        
        if (typeof showSystemNotification === "function") {
            showSystemNotification("📥 Database successfully exported with clean cells.");
        }
    };
}

function importFromExcel() {
    const fileInput = document.getElementById("excelImportInput");
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("⚠️ Import Aborted: Please select a valid Excel file first.");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                alert("❌ Import Error:\n\nThe selected Excel file does not contain any readable worksheets.");
                fileInput.value = "";
                return;
            }

            const targetSheet = workbook.Sheets[workbook.SheetNames[0]];
            const parsedRows = XLSX.utils.sheet_to_json(targetSheet);

            if (!parsedRows || parsedRows.length === 0) {
                alert("❌ Import Error:\n\nThe worksheet is completely empty or has no data rows to extract.");
                fileInput.value = "";
                return;
            }

            const transaction = db.transaction(["projects"], "readwrite");
            const store = transaction.objectStore("projects");

            const parseExcelDateBack = (strVal) => {
                if (!strVal || String(strVal).trim() === "" || String(strVal).trim() === "-") return "";
                const d = new Date(strVal);
                if (isNaN(d.getTime())) return String(strVal);
                return d.toISOString().split('T')[0];
            };

            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = (event) => {
                const existingRecords = event.target.result || [];
                let processedCount = 0;

                let combinedRecords = [...existingRecords];

                parsedRows.forEach(row => {
                    const getExcelValue = (prefixes) => {
                        const matchingKey = Object.keys(row).find(k => 
                            prefixes.some(p => k.trim().toLowerCase() === p.toLowerCase())
                        );
                        return matchingKey ? row[matchingKey] : undefined;
                    };

                    const excelTitle = String(getExcelValue(["Name of Project", "title"]) || "").trim();
                    if (!excelTitle || excelTitle === "-") return;

                    processedCount++;

                    const excelNo = getExcelValue(["NO", "NO.", "projectNo"]);
                    let finalProjectNo = "";
                    if (excelNo !== undefined && String(excelNo).trim() !== "") {
                        finalProjectNo = String(excelNo).trim();
                    }

                    let matchedDirection = "";
                    const rawInOut = getExcelValue(["IN/OUT", "IN / OUT STATUS", "in/out"]);
                    if (rawInOut) {
                        const normalizedStr = String(rawInOut).trim().toLowerCase();
                        if (normalizedStr === "in") matchedDirection = "In";
                        if (normalizedStr === "out") matchedDirection = "Out";
                    }

                    const existingIndex = combinedRecords.findIndex(
                        rec => (rec.title || "").trim().toLowerCase() === excelTitle.toLowerCase()
                    );

                    const budget = getExcelValue(["Approved Budget for Contract", "APPROVED BUDGET FOR CONTRACT (ABC)", "budget"]);
                    const bidder = getExcelValue(["Winning Bidder", "winning bidder"]);
                    const amount = getExcelValue(["Bid Amount", "bid amount"]);
                    const bDate = getExcelValue(["Date of Bidding", "date of bidding"]);
                    const duration = getExcelValue(["Contract Duration", "contract duration"]);
                    const noaDate = getExcelValue(["NOA", "NOTICE OF AWARD (NOA)", "noa date"]);
                    const pBond = getExcelValue(["PERFORMANCE BOND", "performance bond"]);
                    const cRef = getExcelValue(["CONTRACT", "CONTRACT REFERENCE", "contract date reference"]);
                    const doleDate = getExcelValue(["DOLE", "DOLE CLEARANCE", "dole date"]);
                    const eDate = getExcelValue(["CONTRACT END DATE", "contract end date"]);
                    const ntpDate = getExcelValue(["NTP", "NOTICE TO PROCEED (NTP)", "ntp date"]);
                    const compDate = getExcelValue(["Completion", "TARGET COMPLETION", "completion date"]);
                    const damages = getExcelValue(["Liquidated Damages", "liquidated damages"]);
                    const rowRemarks = getExcelValue(["Remarks", "remarks"]);
                    const rawStatus = getExcelValue(["OPERATIONAL STATUS", "Operational Status", "status"]);

                    if (existingIndex !== -1) {
                        combinedRecords[existingIndex] = {
                            ...combinedRecords[existingIndex], 
                            projectNo: finalProjectNo || combinedRecords[existingIndex].projectNo,
                            approvedBudget: budget !== undefined ? String(budget) : combinedRecords[existingIndex].approvedBudget,
                            winningBidder: bidder !== undefined ? String(bidder) : combinedRecords[existingIndex].winningBidder,
                            bidAmount: amount !== undefined ? String(amount) : combinedRecords[existingIndex].bidAmount,
                            biddingDate: parseExcelDateBack(bDate) || combinedRecords[existingIndex].biddingDate,
                            contractDuration: duration !== undefined ? String(duration) : combinedRecords[existingIndex].contractDuration,
                            noa: parseExcelDateBack(noaDate) || combinedRecords[existingIndex].noa,
                            performanceBond: parseExcelDateBack(pBond) || combinedRecords[existingIndex].performanceBond,
                            contractRef: parseExcelDateBack(cRef) || combinedRecords[existingIndex].contractRef,
                            dole: parseExcelDateBack(doleDate) || combinedRecords[existingIndex].dole,
                            contractEndDate: parseExcelDateBack(eDate) || combinedRecords[existingIndex].contractEndDate,
                            ntpDate: parseExcelDateBack(ntpDate) || combinedRecords[existingIndex].ntpDate,
                            completion: parseExcelDateBack(compDate) || combinedRecords[existingIndex].completion,
                            liquidatedDamages: damages !== undefined ? String(damages) : combinedRecords[existingIndex].liquidatedDamages,
                            remarks: rowRemarks !== undefined ? String(rowRemarks) : combinedRecords[existingIndex].remarks,
                            inOut: matchedDirection || combinedRecords[existingIndex].inOut,
                            status: rawStatus && String(rawStatus).trim().toLowerCase() === "completed" ? "Completed" : "Pending",
                            updatedAt: new Date().toISOString()
                        };
                    } else {
                        const newPayload = {
                            projectNo: finalProjectNo, 
                            title: excelTitle,
                            approvedBudget: budget !== undefined ? String(budget) : "",
                            winningBidder: bidder !== undefined ? String(bidder) : "",
                            bidAmount: amount !== undefined ? String(amount) : "",
                            biddingDate: parseExcelDateBack(bDate),
                            contractDuration: duration !== undefined ? String(duration) : "",
                            noa: parseExcelDateBack(noaDate),
                            performanceBond: parseExcelDateBack(pBond),
                            contractRef: parseExcelDateBack(cRef),
                            dole: parseExcelDateBack(doleDate),
                            contractEndDate: parseExcelDateBack(eDate),
                            ntpDate: parseExcelDateBack(ntpDate),
                            completion: parseExcelDateBack(compDate),
                            liquidatedDamages: damages !== undefined ? String(damages) : "",
                            remarks: rowRemarks !== undefined ? String(rowRemarks) : "",
                            inOut: matchedDirection,
                            status: rawStatus && String(rawStatus).trim().toLowerCase() === "completed" ? "Completed" : "Pending",
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        };
                        combinedRecords.push(newPayload);
                    }
                });

                combinedRecords.sort((a, b) => Number(a.projectNo || 0) - Number(b.projectNo || 0));

                combinedRecords.forEach((record, idx) => {
                    record.projectNo = String(idx + 1);
                    store.put(record); 
                });

                transaction.oncomplete = () => {
                    alert(`🎉 Success!\n\nExcel sheet synchronized successfully.\nTotal rows processed: ${processedCount}`);
                    fileInput.value = ""; 
                    loadDocuments();
                };
            };

            transaction.onerror = function() {
                alert("❌ Database Error:\n\nFailed to commit changes to local repository storage.");
                fileInput.value = "";
            };

        } catch (error) {
            alert(`❌ Application Runtime Crash:\n\nAn unexpected error occurred parsing the file structure:\n${error.message}`);
            fileInput.value = "";
        }
    };

    reader.onerror = function() {
        alert("❌ File Reader Error: Web browser failed to parse this file.");
        fileInput.value = "";
    };

    reader.readAsArrayBuffer(file);
}

/* ==========================================================================
   DYNAMIC TEXTAREA AUTO-EXPAND ENGINE
   ========================================================================= */
document.addEventListener("input", function (event) {
    if (event.target && event.target.classList.contains("auto-expand")) {
        autoExpandTextarea(event.target);
    }
});

function autoExpandTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
}

/* ==========================================================================
   INTERACTIVE PURGE WORKFLOW ENGINE (DELETE ALL RECORDS)
   ========================================================================== */
function triggerPurgeDatabaseWorkflow() {
    if (!currentProjectsList || currentProjectsList.length === 0) {
        alert("There are no project records currently stored in the repository to delete.");
        return;
    }

    const exportChoice = confirm("WARNING: You are about to wipe all data.\n\nDo you want to export your current project records to an Excel backup file before deleting?");

    if (exportChoice) {
        exportToExcel();
        alert("Data successfully exported! Click OK to trigger the repository data erasure process.");
        executeClearDatabaseWithLoadingOverlay();
    } else {
        const finalDoubleCheck = confirm("ARE YOU ABSOLUTELY SURE?\n\nYou chose NOT to export a backup. This will permanently delete your database records and historical audit logs. This cannot be undone.");
        if (finalDoubleCheck) {
            executeClearDatabaseWithLoadingOverlay();
        } else {
            showSystemNotification("Data clearing operation aborted. Your files are safe.");
        }
    }
}

function executeClearDatabaseWithLoadingOverlay() {
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.classList.add("active");

    setTimeout(() => {
        const transaction = db.transaction(["projects", "history"], "readwrite");
        const projectStore = transaction.objectStore("projects");
        const historyStore = transaction.objectStore("history");

        projectStore.clear();
        historyStore.clear();

        transaction.oncomplete = () => {
            setTimeout(() => {
                if (loader) loader.classList.remove("active");
                alert("All records and historical change trails have been successfully deleted.");
                editingId = null;
                currentPage = 1;
                resetFormAccess();
                loadDocuments();
            }, 600);
        };

        transaction.onerror = (e) => {
            if (loader) loader.classList.remove("active");
            console.error("Database purge transaction encountered an expected failure:", e);
            alert("An issue occurred while clearing local memory tracks.");
        };
    }, 200);
}