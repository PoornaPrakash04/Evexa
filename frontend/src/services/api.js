import axios from "axios";

export default axios.create({
  baseURL: "https://evexa-production.up.railway.app/api"
});
