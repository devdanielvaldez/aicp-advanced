class Aicp < Formula
  desc "AI Consensus Protocol – collaborative AI for developers"
  homepage "https://github.com/devdanielvaldez/aicp-advanced"
  url "https://github.com/devdanielvaldez/aicp-advanced/archive/refs/tags/v2.0.0.tar.gz"
  sha256 "2eea39defd7e978ca1e06f96ec8eac3b7fb9f874e28f09eb9c9ae32c55805330"
  license "MIT"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"packages/cli/dist/index.js" => "aicp"
  end

  test do
    assert_match "ai Consensus Protocol", shell_output("#{bin}/aicp --version")
  end
end