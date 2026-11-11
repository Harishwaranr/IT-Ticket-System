
async function loadMyTickets() {
    const ticketList = document.getElementById("ticket-list");

    try {
        const response = await fetch("/api/my-tickets");

        if (!response.ok) {
            throw new Error("Unable to load tickets");
        }

        const tickets = await response.json();

        ticketList.innerHTML = "";

        if (tickets.length === 0) {
            ticketList.innerHTML = `
                <tr>
                    <td colspan="6">You have not submitted any tickets yet.</td>
                </tr>
            `;
            return;
        }

        tickets.forEach(ticket => {
            const row = document.createElement("tr");

            const values = [
                ticket.id,
                ticket.title,
                ticket.category,
                ticket.priority,
                ticket.status
            ];

            values.forEach((value, index) => {
                const cell = document.createElement("td");
                cell.textContent = value ?? "-";

                if (index === 4) {
                    const statusClass = String(value)
                        .toLowerCase()
                        .replace(/\s+/g, "-");

                    cell.classList.add("status-" + statusClass);
                }

                row.appendChild(cell);
            });

            // Add View Details button
            const actionCell = document.createElement("td");
            const detailsLink = document.createElement("a");

            detailsLink.textContent = "View Details";
            detailsLink.href = `/ticket/${ticket.id}`;

            actionCell.appendChild(detailsLink);
            row.appendChild(actionCell);

            ticketList.appendChild(row);
        });

    } catch (error) {
        console.error(error);

        ticketList.innerHTML = `
            <tr>
                <td colspan="6">Unable to load tickets. Please try again.</td>
            </tr>
        `;
    }
}

loadMyTickets();
