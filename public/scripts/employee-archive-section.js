let archivedEmployees = [];
let archivedEmployees2 = [];
let archivedMembers = [];
let currentPageForEmployee = 1;
let currentPageForAdminArchive = 1;

const totalPagesEmployee = Math.ceil(archivedEmployees.length / itemsPerPage);
const tableBodyEmployee = document.getElementById("archived-employee-table");
const prevEmployeeBtn = document.querySelector(".prev-page-archive-employee");
const nextEmployeeBtn = document.querySelector(".next-page-archive-employee");

const totalPagesAdmin = Math.ceil(archivedEmployees.length / itemsPerPage);
const tableBodyAdmin = document.getElementById("archived-admin-table");
const prevAdminArchiveBtn = document.querySelector(".prev-page-archive-admin");
const nextAdminArchiveBtn = document.querySelector(".next-page-archive-admin");

const searchArchivedEmployeeBar = document.getElementById(
  "search-archived-employees"
);

  async function fetchArchivedEmployees() {
    try {
      console.log("Fetching archived employees...");
  
      const response = await fetch("/arcms/api/v1/employees/archive");
  
      if (!response.ok) {
        throw new Error(`Failed to fetch employees: ${response.statusText}`);
      }
  
      const { employeesList } = await response.json();
  
      archivedEmployees = employeesList;
      archivedEmployees2 = employeesList;

  
      console.log("Fetched Archived Employees:", archivedEmployees);
  
      displayArchivedEmployees(currentPageForEmployee); // Default to page 1
      setupPaginationEmployees();
    } catch (error) {
      console.error("Error fetching employees:", error);
    }
  }

  function setupPaginationEmployees() {
    const totalPages = Math.ceil(archivedEmployees.length / itemsPerPage);
    const paginationContainer = document.querySelector(".number-buttons-archive-employee");
  
    paginationContainer.innerHTML = ""; // Clear existing pagination buttons
    for (let i = 1; i <= totalPages; i++) {
      const pageButton = document.createElement("a");
      pageButton.href = "#";
      pageButton.textContent = i;
      pageButton.classList.add("page-btn");
  
      pageButton.addEventListener("click", function (event) {
        event.preventDefault();
        currentPageForEmployee = i;
        displayActiveMembers(i);
        updatePaginationStateForArchiveEmployee();
        updateActivePageForArchiveEmployee(i);
      });
  
      if (i === currentPageForEmployee) {
        pageButton.classList.add("active");
      }
  
      paginationContainer.appendChild(pageButton);
    }
  
    prevMembersBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (currentPageForEmployee - 1 >= 1) {
        currentPageForEmployee -= 1;
        displayActiveMembers(currentPageForEmployee);
        updatePaginationStateForArchiveEmployee();
        updateActivePageForArchiveEmployee(currentPageForEmployee);
      }
    });
    nextMembersBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (currentPageForEmployee + 1 <= totalPages) {
        currentPageForEmployee += 1;
        console.log("CURRENT ACTIVE PAGE:", currentPageForEmployee);
        displayActiveMembers(currentPageForEmployee);
        updatePaginationStateForArchiveEmployee();
        updateActivePageForArchiveEmployee(currentPageForEmployee);
      }
    });
  
    updatePaginationStateForArchiveEmployee();
  }
  
  function updateActivePageForArchiveEmployee(selectedPage) {
    const pageButtons = document.querySelectorAll(".number-buttons-archive-employee a");
    pageButtons.forEach((btn) => {
      btn.classList.remove("active"); // Remove active class from all buttons
    });
  
    const selectedButton = document.querySelector(
      `.number-buttons-archive-employee a:nth-child(${selectedPage})`
    );
    selectedButton.classList.add("active"); // Add active class to the clicked button
  }
  
  function updatePaginationStateForArchiveEmployee() {
    const totalResults = archivedEmployees.length;
    const startIndex = (currentPageForEmployee - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPageForEmployee * itemsPerPage, totalResults);
  
    document.querySelector(
      ".pagination-info-archive-employee span:nth-child(1)"
    ).textContent = startIndex;
  
    document.querySelector(
      ".pagination-info-archive-employee span:nth-child(2)"
    ).textContent = endIndex;
    document.querySelector(
      ".pagination-info-archive-employee span:nth-child(3)"
    ).textContent = totalResults;
  }

  searchArchivedEmployeeBar.addEventListener("change", (e) => {
    e.preventDefault();
    currentPageForEmployee = 1;
  
    console.log("ARCHIVED EMPS:", archivedEmployees);
  
    if (searchArchivedEmployeeBar.value == "") {
      archivedEmployees = archivedEmployees2;
    } else {
      const searchValue = searchArchivedEmployeeBar.value
        .toLowerCase()
        .replace(/-/g, "")
        .trim();
  
      archivedEmployees = archivedEmployees2.filter((employee) => {
        const empNum = employee.employee_number
          .toString()
          .toLowerCase()
          .replace(/-/g, "");
  
        const email = employee.email.toLowerCase();
        const name = `${employee.first_name} ${employee.middle_name || ""} ${
          employee.last_name
        }`
          .trim()
          .toLowerCase();
  
        return (
          empNum.includes(searchValue) ||
          email.includes(searchValue) ||
          name.includes(searchValue)
        );
      });
    }
  
    displayArchivedEmployees(currentPageForActive);
    setupPaginationEmployees();
  });

  async function displayArchivedEmployees(pageNumber) {
    const startIndex = (pageNumber - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const membersToDisplay = archivedEmployees.slice(startIndex, endIndex);
    membersToDisplay.sort((a, b) => a.employee_number - b.employee_number);
  
    tableBodyEmployee.innerHTML = ""; // Clear existing content
    membersToDisplay.forEach((member, index) => {
      const row = document.createElement("tr");
  
      console.log("the freaking member:", member);
      // <td>${startIndex + index + 1}</td>
      const name =
        (member.honorifics || "") +
        " " +
        member.first_name +
        " " +
        (member.middle_name || "") +
        " " +
        member.last_name;
      row.innerHTML = `
                  <td>${member.employee_number}</td>
                  <td class="member-info">
                      <div>
                          <img src="${member.image_url}" alt="${name}">
                          <div class="member-name">${name}</div>
                          <div class="member-email">${member.email}</div>
                      </div>
                  </td>
                  <td>${member.isActive ? "Active" : "Inactive"}</td>
                  <td>${member.date_created}</td>
                  <td>
                    <a href="#" class="activate-btn" data-id="${
                      member.employee_id
                    }">Unarchive</a>
                  </td>
              `;
  
      tableBodyEmployee.appendChild(row);
    });
  
    // const deleteButtons = document.querySelectorAll(".delete-btn-archive");
  
    // deleteButtons.forEach((button) => {
    //   button.addEventListener("click", (event) => {
    //     const employeeId = event.target.getAttribute("data-id");
  
    //     deleteArchivedEmployee(employeeId);
    //   });
    // });

    const unarchiveButtons = document.querySelectorAll(".activate-btn");
  
    unarchiveButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        const employeeId = event.target.getAttribute("data-id");
  
        unarchiveEmployee(employeeId);
      });
    });
  }

  async function unarchiveEmployee(employee_id){
    if (confirm("Are you sure you want to reactivate this employee?")){
        employee_id = Number(employee_id);
        try {
        const response = await fetch(`/arcms/api/v1/employees/unarchive/${employee_id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
        });
    
        const result = await response.json();
    
        if (response.ok) {
            showSuccessMessage("User unarchived successfully!");
    
            // Remove the deleted employee from the employees array
            archivedEmployees = archivedEmployees.filter(
            (employee) => employee.employee_id !== employee_id
            );
            archivedEmployees2 = archivedEmployees2.filter(
            (employee) => employee.employee_id !== employee_id
            );

    
            // Update the display and pagination
            displayArchivedEmployees(currentPageForEmployee); // Use the current page or update as necessary
            setupPaginationEmployees();
        } else {
            showErrorMessage(`Error: ${result.error}`);
        }
        } catch (error) {
        console.error("Error reactivating user:", error);
        showErrorMessage("An error occurred while reactivating the user.");
        }
    }
  }

  async function deleteArchivedEmployee(employee_id) {
    if (confirm("Are you sure you want to permanently delete this employee?")){
        employee_id = Number(employee_id);
        try {
        const response = await fetch(`/arcms/api/v1/employees/${employee_id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
        });
    
        const result = await response.json();
    
        if (response.ok) {
            showErrorMessage("User deleted successfully!");
    
            // Remove the deleted employee from the employees array
            archivedEmployees = archivedEmployees.filter(
            (employee) => employee.employee_id !== employee_id
            );
    
            // Update the display and pagination
            displayArchivedEmployees(currentPageForEmployee); // Use the current page or update as necessary
            setupPaginationEmployees();
        } else {
            showErrorMessage(`Error: ${result.error}`);
        }
        } catch (error) {
        console.error("Error deleting user:", error);
        showErrorMessage("An error occurred while deleting the user.");
        }
    }
    
  }


  fetchArchivedEmployees();