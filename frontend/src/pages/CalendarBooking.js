import { useEffect, useState } from "react";
import axios from "../services/api";

export default function CalendarBooking() {
  const [currentDate] = useState(new Date());
  const [fullyBookedDates, setFullyBookedDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);

  const token = localStorage.getItem("token");
  const venue = "Main Hall";

  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");

 useEffect(() => {
  fetchCalendar();
// eslint-disable-next-line
}, []);

  const fetchCalendar = async () => {
    const res = await axios.get(
      `/venue/calendar?venue_name=${venue}&year=${year}&month=${month}`,
      { headers: { Authorization: token } }
    );
    setFullyBookedDates(res.data);
  };

  const fetchSlots = async (date) => {
    setSelectedDate(date);

    const res = await axios.get(
      `/venue/slots?venue_name=${venue}&date=${date}`,
      { headers: { Authorization: token } }
    );

    setSlots(res.data);
  };

  const bookSlot = async (slot) => {
    await axios.post(
      "/venue/book",
      {
        venue_name: venue,
        event_id: 1,
        date: selectedDate,
        start_time: slot.start,
        end_time: slot.end
      },
      { headers: { Authorization: token } }
    );

    fetchSlots(selectedDate);
    fetchCalendar();
  };

  const generateDays = () => {
    const days = [];
    const totalDays = new Date(year, month, 0).getDate();

    for (let d = 1; d <= totalDays; d++) {
      const formatted = `${year}-${month}-${String(d).padStart(2, "0")}`;
      const isBooked = fullyBookedDates.includes(formatted);

      days.push(
        <div
          key={d}
          onClick={() => !isBooked && fetchSlots(formatted)}
          style={{
            padding: "15px",
            margin: "5px",
            backgroundColor: isBooked ? "red" : "green",
            color: "white",
            cursor: isBooked ? "not-allowed" : "pointer",
            borderRadius: "5px"
          }}
        >
          {d}
        </div>
      );
    }

    return days;
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Venue Booking - {venue}</h2>

      <div style={{ display: "flex", flexWrap: "wrap", maxWidth: "500px" }}>
        {generateDays()}
      </div>

      {selectedDate && (
        <>
          <h3>Slots for {selectedDate}</h3>
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {slots.map((slot, i) => (
              <button
                key={i}
                disabled={!slot.available}
                onClick={() => slot.available && bookSlot(slot)}
                style={{
                  margin: "5px",
                  padding: "10px",
                  backgroundColor: slot.available ? "green" : "red",
                  color: "white",
                  border: "none",
                  cursor: slot.available ? "pointer" : "not-allowed"
                }}
              >
                {slot.start.slice(0,5)} - {slot.end.slice(0,5)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
