on run
	set appBundlePath to POSIX path of (path to me)
	do shell script "APP_PATH=" & quoted form of appBundlePath & "; ROOT_DIR=$(cd \"$APP_PATH/..\" && pwd); \"$ROOT_DIR/NewtNode.command\" >/dev/null 2>&1 &"
end run
