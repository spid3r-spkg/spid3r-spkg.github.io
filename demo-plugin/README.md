# demo-plugin

Demo Spid3r package published via the zero-clone thin-index workflow on `spid3r-spkg.github.io`.

## Installation

```bash
spkg install demo-plugin
```

Or in `spider.toml`:

```toml
[dependencies]
demo-plugin = { version = "^0.1.0" }
```

## Usage

```matrix
import "demo-plugin" as demo;

fn main() {
    println(demo.banner("Spid3r"));
    println(demo.add(2, 3));
}
```
