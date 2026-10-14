package engineadapt

import (
	"path/filepath"
	"testing"
)

func TestContainerName(t *testing.T) {
	if got := ContainerName("7"); got != "onewifi-engine-7" {
		t.Fatalf("ContainerName = %q", got)
	}
}

func TestBindsMatchEngine(t *testing.T) {
	got := Binds("data", "7", "onewifi-pcscd")
	base := filepath.Join("data", "instances", "7")
	want := []string{
		filepath.Join(base, "instance.json") + ":/config/instance.json:ro",
		filepath.Join(base, "logs") + ":/logs:rw",
		filepath.Join(base, "run") + ":/run/onewifi:rw",
		"onewifi-pcscd:/run/pcscd:rw",
	}
	if len(got) != len(want) {
		t.Fatalf("binds = %#v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("bind %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestTunnelConnected(t *testing.T) {
	if !TunnelConnected([]byte(`{"state":"CONNECTED"}`)) {
		t.Fatal("CONNECTED must count as up")
	}
	for _, body := range []string{"", "{}", `{"state":"CONNECTING"}`, "not-json"} {
		if TunnelConnected([]byte(body)) {
			t.Fatalf("%q counted as up", body)
		}
	}
}

func TestOwnedRequiresManagedLabel(t *testing.T) {
	if !Owned(map[string]string{"io.onewifi.managed": "true"}) {
		t.Fatal("managed container must be owned")
	}
	if Owned(map[string]string{"io.onewifi.component": "engine"}) {
		t.Fatal("component label alone must not allow replacement")
	}
	if Owned(nil) {
		t.Fatal("missing labels must not allow replacement")
	}
}
