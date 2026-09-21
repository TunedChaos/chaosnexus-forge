#![allow(dead_code)]

#[must_use]
pub fn format_rust(src: &str) -> String {
    prettyplease::unparse(&syn::parse_str(src).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_rust_prettyprints_fn() {
        let out = format_rust("fn foo(){let x=1;}");
        assert!(out.contains("fn foo()"));
        assert!(out.contains("let x = 1"));
    }
}
