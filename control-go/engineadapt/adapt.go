package engineadapt

import (
	"encoding/json"
	"path/filepath"
)

func ContainerName(id string) string {
	return "onewifi-engine-" + id
}

func Binds(dataDir, id, pcscd string) []string {
	base := filepath.Join(dataDir, "instances", id)
	return []string{
		filepath.Join(base, "instance.json") + ":/config/instance.json:ro",
		filepath.Join(base, "logs") + ":/logs:rw",
		filepath.Join(base, "run") + ":/run/onewifi:rw",
		pcscd + ":/run/pcscd:rw",
	}
}

func TunnelConnected(body []byte) bool {
	var status struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(body, &status); err != nil {
		return false
	}
	return status.State == "CONNECTED"
}

func Owned(labels map[string]string) bool {
	return labels["io.onewifi.managed"] == "true"
}
