const session = require("express-session");
const Keycloak = require("keycloak-connect");

let _keycloak;

const keycloakConfig = {
  clientId: "my-react-app",
  bearerOnly: true,
  serverUrl: "http://localhost:8080/",
  realm: "chat-app",
  credentials: {
    secret: "bFUtkzEs7nOV0DPBcRnD9ibVhiSYlkqF",
  },
};

function initKeycloak(memoryStore) {
  if (_keycloak) {
    console.warn("Keycloak already initialized!");
    return _keycloak;
  }
  _keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);
  return _keycloak;
}

function getKeycloak() {
  if (!_keycloak) console.error("Keycloak has not been initialized!");
  return _keycloak;
}

module.exports = { initKeycloak, getKeycloak };
